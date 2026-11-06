const request = require('supertest');
const fs = require('fs');
const path = require('path');
const db = require('./helpers/db');
const app = require('../app');
const { makeFlat, makeUser, bearer } = require('./helpers/factory');
const ai = require('../services/aiClassifier');
const { detectEmergency } = require('../services/emergency');
const { similarity } = require('../services/duplicates');
const Complaint = require('../models/Complaint');
const History = require('../models/ComplaintStatusHistory');
const { UPLOAD_DIR } = require('../middleware/upload');

let flat1, flat2, flatOtherTower, r1, r2, r3, desk, desk2, manager, committee, geminiSpy;
const aiReturns = (o) => (geminiSpy = jest.spyOn(ai, 'callGemini')).mockResolvedValue({ category: 'Plumbing', urgency: 'Medium', reasoning: 'Water leakage reported.', confidence: 0.9, ...o });
const raise = (user, body, attach) => {
  const req = request(app).post('/api/complaints').set(bearer(user));
  if (attach) return req.field(body).attach('image', attach.buffer, { filename: attach.name, contentType: attach.type });
  return req.send(body);
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

beforeAll(async () => {
  await db.connect('society360_test_complaints');
  flat1 = await makeFlat({ tower: 'T05' }); flat2 = await makeFlat({ tower: 'T05' }); flatOtherTower = await makeFlat({ tower: 'T19' });
  r1 = await makeUser('resident', { flat: flat1._id }); r2 = await makeUser('resident', { flat: flat2._id });
  r3 = await makeUser('resident', { flat: flatOtherTower._id });
  desk = await makeUser('helpdesk'); desk2 = await makeUser('helpdesk');
  manager = await makeUser('helpdesk', { name: 'Duty Manager', isDutyManager: true });
  committee = await makeUser('committee');
});
beforeEach(() => { geminiSpy = jest.spyOn(ai, 'callGemini'); aiReturns({}); });
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  for (const f of fs.readdirSync(UPLOAD_DIR)) if (f !== '.gitkeep') fs.unlinkSync(path.join(UPLOAD_DIR, f));
  await db.disconnect();
});

describe('Emergency rules (deterministic, independent of AI)', () => {
  test.each([
    ['There is a fire in the parking basement', 'Fire'],
    ['I can smell a gas leak near the kitchen riser', 'Gas leak'],
    ['Our lift is stuck between floors with a child inside', 'Lift stuck'],
    ['Someone got an electric shock from the meter box', 'Electric shock'],
  ])('%s => %s', (text, label) => {
    expect(detectEmergency(text)).toMatchObject({ isEmergency: true, keywords: [label] });
  });
  test('ordinary text and equipment mentions are not emergencies', () => {
    expect(detectEmergency('Fire extinguisher on floor 3 is expired').isEmergency).toBe(false);
    expect(detectEmergency('The bonfire last night was loud').isEmergency).toBe(false);
    expect(detectEmergency('Tap is dripping in the bathroom').isEmergency).toBe(false);
  });
});

describe('AI output validation', () => {
  test('valid JSON (even fenced) parses; bad category or malformed JSON is rejected', () => {
    expect(ai.parseAiOutput('```json\n{"category":"Lift","urgency":"High","reasoning":"x","confidence":0.8}\n```').category).toBe('Lift');
    expect(() => ai.parseAiOutput('{"category":"Gardening","urgency":"High","reasoning":"x"}')).toThrow();
    expect(() => ai.parseAiOutput('not json')).toThrow();
  });
  test('missing GEMINI_API_KEY is a failure, never a fabricated answer', async () => {
    jest.restoreAllMocks();
    await expect(ai.callGemini('tap leaking')).rejects.toThrow(/GEMINI_API_KEY/);
  });
});

describe('Complaint creation and AI classification', () => {
  test('resident creates a complaint; structured AI result is stored', async () => {
    aiReturns({ category: 'Plumbing', urgency: 'High', reasoning: 'Active water leak.', confidence: 0.92 });
    const res = await raise(r1, { title: 'Water leaking from ceiling', description: 'Water is dripping from the bathroom ceiling since morning', location: 'Bathroom' });
    expect(res.status).toBe(201);
    expect(res.body.complaint).toMatchObject({ category: 'Plumbing', urgency: 'High', status: 'New', ticketNo: expect.stringMatching(/^CMP-/) });
    expect(res.body.complaint.ai).toMatchObject({ source: 'gemini', reasoning: 'Active water leak.', confidence: 0.92, needsManualReview: false });
    expect(await History.countDocuments({ complaint: res.body.complaint._id, action: 'created' })).toBe(1);
  });
  test('emergency keyword overrides a low AI prediction: Critical + duty manager', async () => {
    aiReturns({ category: 'Cleaning', urgency: 'Low', reasoning: 'Looks minor.', confidence: 0.99 });
    const res = await raise(r2, { title: 'Smell in corridor', description: 'There is a strong gas leak smell near the lift lobby' });
    expect(res.status).toBe(201);
    const c = res.body.complaint;
    expect(c).toMatchObject({ urgency: 'Critical', escalatedToDutyManager: true, status: 'Assigned' });
    expect(c.emergencyKeywords).toContain('Gas leak');
    expect(c.ai.source).toBe('safety_rule');
    expect(c.assignedTo.name).toBe('Duty Manager');
  });
  test('AI failure: complaint is still accepted, category Other, flagged for manual review, nothing fabricated', async () => {
    geminiSpy.mockRejectedValue(new Error('503 Service Unavailable'));
    const res = await raise(r1, { title: 'Garbage not collected', description: 'Garbage has not been collected from our floor for two days' });
    expect(res.status).toBe(201);
    expect(res.body.complaint).toMatchObject({ category: 'Other', status: 'New' });
    expect(res.body.complaint.ai).toMatchObject({ source: 'fallback', needsManualReview: true, confidence: null });
  });
  test('emergency stays Critical even when AI is down', async () => {
    geminiSpy.mockRejectedValue(new Error('timeout'));
    const res = await raise(r3, { title: 'Lift problem', description: 'Lift stuck on the 7th floor, two people inside' });
    expect(res.body.complaint).toMatchObject({ urgency: 'Critical', category: 'Lift', escalatedToDutyManager: true });
  });
  test('classify preview does not save anything', async () => {
    const before = await Complaint.countDocuments();
    const res = await request(app).post('/api/complaints/classify').set(bearer(r1)).send({ title: 'Light flickering', description: 'Corridor light keeps flickering at night' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('category');
    expect(await Complaint.countDocuments()).toBe(before);
  });
  test('validation rejects short input; only residents can raise complaints', async () => {
    expect((await raise(r1, { title: 'x', description: 'short' })).status).toBe(400);
    expect((await raise(desk, { title: 'Valid title', description: 'A long enough description' })).status).toBe(403);
  });
});

describe('Image upload safety', () => {
  const body = { title: 'Broken stair railing', description: 'The railing on the second floor staircase is loose' };
  test('valid image is stored under a random server-side name', async () => {
    const res = await raise(r1, body, { buffer: PNG, name: 'my photo.png', type: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.complaint.imagePath).toMatch(/^\/uploads\/[a-f0-9]{24}\.png$/);
  });
  test('wrong type and spoofed image (text posing as PNG) are rejected', async () => {
    expect((await raise(r1, body, { buffer: Buffer.from('MZ-evil'), name: 'a.exe', type: 'application/octet-stream' })).status).toBe(400);
    const before = fs.readdirSync(UPLOAD_DIR).length;
    expect((await raise(r1, body, { buffer: Buffer.from('<script>alert(1)</script>'), name: 'a.png', type: 'image/png' })).status).toBe(400);
    expect(fs.readdirSync(UPLOAD_DIR).length).toBe(before);
  });
});

describe('Duplicate complaints', () => {
  test('similar complaints in the same tower are linked, never auto-closed', async () => {
    aiReturns({ category: 'Electrical', urgency: 'Medium', reasoning: 'Power issue.' });
    const a = await raise(r1, { title: 'Street light not working', description: 'Street light near tower five gate is not working since last night', location: 'Gate' });
    const b = await raise(r2, { title: 'Street light is off', description: 'The street light near tower five gate is off since last night', location: 'Gate' });
    expect(b.body.duplicatesLinked).toBe(1);
    expect(b.body.complaint.duplicateOf.ticketNo).toBe(a.body.complaint.ticketNo);
    const original = await Complaint.findById(a.body.complaint._id);
    expect(original.status).toBe('New');
    expect(original.relatedComplaints.map(String)).toContain(b.body.complaint._id);
    expect(b.body.complaint.status).toBe('New');
  });
  test('the same issue in a different tower is not linked', async () => {
    aiReturns({ category: 'Electrical', urgency: 'Medium', reasoning: 'Power issue.' });
    const c = await raise(r3, { title: 'Street light not working', description: 'Street light near the gate is not working since last night', location: 'Gate' });
    expect(c.body.duplicatesLinked).toBe(0);
  });
  test('similarity ignores unrelated text', () => {
    expect(similarity('water leak in bathroom ceiling', 'loud music from party hall')).toBe(0);
  });
});

describe('Help desk management', () => {
  let c;
  beforeAll(async () => {
    aiReturns({ category: 'Other', urgency: 'Low', reasoning: 'Unclear.', confidence: 0.3 });
    c = (await raise(r1, { title: 'Strange noise upstairs', description: 'There is a strange humming noise from the terrace water tank' })).body.complaint;
  });
  const patch = (p, body, as = desk) => request(app).patch(`/api/complaints/${c._id}/${p}`).set(bearer(as)).send(body);

  test('low-confidence AI result is flagged for review; staff can correct category and urgency', async () => {
    expect(c.ai.needsManualReview).toBe(true);
    const cat = await patch('category', { category: 'Plumbing' });
    expect(cat.status).toBe(200);
    expect(cat.body.complaint).toMatchObject({ category: 'Plumbing' });
    expect(cat.body.complaint.ai).toMatchObject({ source: 'manual', needsManualReview: false, category: 'Other' });
    expect((await patch('urgency', { urgency: 'High' })).body.complaint.urgency).toBe('High');
    expect(await History.countDocuments({ complaint: c._id, action: { $in: ['category_change', 'urgency_change'] } })).toBe(2);
  });
  test('assign sets staff and moves New -> Assigned; response timer is stamped', async () => {
    const res = await patch('assign', { assignedTo: String(desk2._id) });
    expect(res.body.complaint).toMatchObject({ status: 'Assigned' });
    expect(res.body.complaint.assignedTo.name).toBe(desk2.name);
    expect(res.body.complaint.sla.responded).toBe(true);
  });
  test('cannot assign to a non-staff user', async () => {
    expect((await patch('assign', { assignedTo: String(r1._id) })).status).toBe(400);
  });
  test('status workflow: In Progress -> Resolved -> Closed; invalid jumps and unknown values rejected', async () => {
    expect((await patch('status', { status: 'In Progress' })).body.complaint.status).toBe('In Progress');
    const resolved = await patch('status', { status: 'Resolved', note: 'Valve replaced' });
    expect(resolved.body.complaint.resolvedAt).toBeTruthy();
    expect((await patch('status', { status: 'Closed' })).body.complaint.status).toBe('Closed');
    expect((await patch('status', { status: 'In Progress' })).status).toBe(409);
    expect((await patch('status', { status: 'Nonsense' })).status).toBe(400);
  });
  test('history records every change in order', async () => {
    const res = await request(app).get(`/api/complaints/${c._id}`).set(bearer(desk));
    const actions = res.body.history.map((h) => h.action);
    expect(actions[0]).toBe('created');
    expect(actions).toEqual(expect.arrayContaining(['category_change', 'urgency_change', 'assigned', 'status_change']));
  });
  test('emergency complaints cannot be downgraded below Critical', async () => {
    const e = (await raise(r2, { title: 'Emergency', description: 'Fire in the electrical room next to the lobby' })).body.complaint;
    const res = await request(app).patch(`/api/complaints/${e._id}/urgency`).set(bearer(desk)).send({ urgency: 'Low' });
    expect(res.status).toBe(409);
    expect((await Complaint.findById(e._id)).urgency).toBe('Critical');
  });
  test('residents and committee cannot change complaints', async () => {
    expect((await patch('status', { status: 'Closed' }, r1)).status).toBe(403);
    expect((await patch('category', { category: 'Lift' }, committee)).status).toBe(403);
  });
});

describe('Resident tracking, rating and ownership', () => {
  let c;
  beforeAll(async () => {
    aiReturns({});
    c = (await raise(r1, { title: 'Dripping tap in kitchen', description: 'The kitchen tap keeps dripping even when closed' })).body.complaint;
  });
  test('residents see only their own complaints', async () => {
    const mine = await request(app).get('/api/complaints/mine').set(bearer(r1));
    expect(mine.body.complaints.every((x) => String(x.flat._id) === String(flat1._id))).toBe(true);
    expect((await request(app).get(`/api/complaints/${c._id}`).set(bearer(r2))).status).toBe(403);
    expect((await request(app).get(`/api/complaints/${c._id}`).set(bearer(r1))).status).toBe(200);
  });
  test('rating only works on resolved complaints, once, by the owner', async () => {
    const rate = (as, rating = 5) => request(app).post(`/api/complaints/${c._id}/rating`).set(bearer(as)).send({ rating });
    expect((await rate(r1)).status).toBe(409);
    await request(app).patch(`/api/complaints/${c._id}/status`).set(bearer(desk)).send({ status: 'Resolved' });
    expect((await rate(r2)).status).toBe(403);
    expect((await rate(r1, 6)).status).toBe(400);
    expect((await rate(r1, 4)).body.complaint.rating).toBe(4);
    expect((await rate(r1, 5)).status).toBe(409);
  });
  test('resident can reopen a resolved complaint', async () => {
    const res = await request(app).post(`/api/complaints/${c._id}/reopen`).set(bearer(r1)).send({});
    expect(res.body.complaint).toMatchObject({ status: 'Reopened', reopenCount: 1 });
  });
  test('staff list supports filtering; unauthenticated access is refused', async () => {
    const list = await request(app).get('/api/complaints?status=open&urgency=Critical').set(bearer(desk));
    expect(list.status).toBe(200);
    expect(list.body.complaints.every((x) => x.urgency === 'Critical')).toBe(true);
    expect((await request(app).get('/api/complaints')).status).toBe(401);
    expect((await request(app).get('/api/complaints').set(bearer(r1))).status).toBe(403);
  });
});
