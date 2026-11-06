const request = require('supertest');
const db = require('./helpers/db');
const app = require('../app');
const { makeFlat, makeUser, makeBill, bearer } = require('./helpers/factory');
const Complaint = require('../models/Complaint');
const Bill = require('../models/Bill');

let desk, committee, resident, f1, f2, f3, f4, bill4;
const mk = (flat, o) => Complaint.create({
  ticketNo: `CMP-${Math.floor(Math.random() * 1e9)}`, flat: flat._id, raisedBy: resident._id, title: 'T', description: 'Some description here',
  ...o,
});
const hours = (h) => new Date(Date.now() - h * 3600000);

beforeAll(async () => {
  await db.connect('society360_test_dash');
  desk = await makeUser('helpdesk'); committee = await makeUser('committee');
  f1 = await makeFlat({ areaSqft: 1000 }); f2 = await makeFlat({ areaSqft: 1000 }); f3 = await makeFlat({ areaSqft: 1000 }); f4 = await makeFlat({ areaSqft: 1000 });
  resident = await makeUser('resident', { flat: f1._id });
  await makeBill(f1, { daysOverdue: 0, paid: 6500 });          // fully paid
  await makeBill(f2, { daysOverdue: 15 });                     // 6500 outstanding, 0-30
  await makeBill(f3, { daysOverdue: 47, paid: 2500 });         // 4000 outstanding, 31-60
  bill4 = await makeBill(f4, { daysOverdue: 100 });            // 6500 outstanding, 90+

  await mk(f1, { status: 'New', urgency: 'Critical', category: 'Lift', createdAt: hours(1) });
  await mk(f1, { status: 'In Progress', urgency: 'Medium', category: 'Plumbing', assignedTo: desk._id, respondedAt: hours(5), createdAt: hours(6) });
  await mk(f2, { status: 'Resolved', urgency: 'Low', category: 'Plumbing', createdAt: hours(30), resolvedAt: hours(6) });  // 24h
  await mk(f2, { status: 'Closed', urgency: 'Low', category: 'Cleaning', createdAt: hours(50), resolvedAt: hours(38), reopenCount: 1 }); // 12h
  await mk(f3, { status: 'Reopened', urgency: 'High', category: 'Electrical', createdAt: hours(3), reopenCount: 2 });
});
afterAll(db.disconnect);

describe('Help desk dashboard', () => {
  let body;
  beforeAll(async () => { body = (await request(app).get('/api/dashboard/helpdesk').set(bearer(desk))).body; });
  test('counts come from the database', () => {
    expect(body.totals).toMatchObject({ total: 5, new: 1, inProgress: 1, reopened: 1, resolved: 2, critical: 1 });
  });
  test('assignment queue holds unassigned open complaints, most urgent first', () => {
    expect(body.assignmentQueue.map((c) => c.urgency)).toEqual(['Critical', 'High']);
  });
  test('response timers list complaints awaiting a first response and flag SLA breaches', () => {
    const critical = body.responseTimers.find((c) => c.urgency === 'Critical');
    expect(critical.sla.responded).toBe(false);
    expect(critical.sla.breached).toBe(true); // 1h old, 15 minute target
    expect(body.totals.slaBreached).toBeGreaterThanOrEqual(1);
  });
  test('residents are refused; committee may view', async () => {
    expect((await request(app).get('/api/dashboard/helpdesk').set(bearer(resident))).status).toBe(403);
    expect((await request(app).get('/api/dashboard/helpdesk').set(bearer(committee))).status).toBe(200);
  });
});

describe('Committee dashboard', () => {
  const get = (as = committee) => request(app).get('/api/dashboard/committee').set(bearer(as));
  test('financial metrics are computed from bills', async () => {
    const { financial } = (await get()).body;
    expect(financial).toMatchObject({ totalBilled: 26000, totalCollected: 9000, outstanding: 17000, paidFlats: 1, unpaidFlats: 3, totalFlats: 4 });
    expect(financial.collectionPercentage).toBeCloseTo(34.62, 1);
  });
  test('dues ageing buckets', async () => {
    const { ageing } = (await get()).body;
    const m = Object.fromEntries(ageing.map((a) => [a.bucket, a]));
    expect(m['0-30']).toMatchObject({ amount: 6500, flats: 1 });
    expect(m['31-60']).toMatchObject({ amount: 4000, flats: 1 });
    expect(m['61-90']).toMatchObject({ amount: 0, flats: 0 });
    expect(m['90+']).toMatchObject({ amount: 6500, flats: 1 });
  });
  test('complaint metrics and average resolution time', async () => {
    const { complaints } = (await get()).body;
    expect(complaints).toMatchObject({ total: 5, open: 3, resolved: 2, reopened: 2, averageResolutionHours: 18 });
    expect(complaints.byCategory.find((c) => c.category === 'Plumbing').count).toBe(2);
  });
  test('values change when the database changes (nothing hardcoded)', async () => {
    await Bill.updateOne({ _id: bill4._id }, { $set: { paidAmount: 6500, status: 'paid' } });
    const { financial, ageing } = (await get()).body;
    expect(financial.totalCollected).toBe(15500);
    expect(financial.unpaidFlats).toBe(2);
    expect(ageing.find((a) => a.bucket === '90+').amount).toBe(0);
  });
  test('only the committee may open it, and it is read-only', async () => {
    expect((await get(desk)).status).toBe(403);
    expect((await get(resident)).status).toBe(403);
    expect((await request(app).post('/api/dashboard/committee').set(bearer(committee)).send({})).status).toBe(404);
    expect((await request(app).get('/api/dashboard/committee')).status).toBe(401);
  });
});
