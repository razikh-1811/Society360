const fs = require('fs');
const Complaint = require('../models/Complaint');
const ComplaintAssignment = require('../models/ComplaintAssignment');
const History = require('../models/ComplaintStatusHistory');
const Flat = require('../models/Flat');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const { hasImageSignature } = require('../middleware/upload');
const { triageComplaint } = require('../services/triage');
const { findDuplicates } = require('../services/duplicates');

const OPEN = ['New', 'Assigned', 'In Progress', 'Reopened'];
const SLA_MINUTES = { Critical: 15, High: 120, Medium: 480, Low: 1440 };
const NEXT = {
  New: ['Assigned', 'In Progress', 'Resolved', 'Closed'],
  Assigned: ['In Progress', 'Resolved', 'Closed', 'New'],
  'In Progress': ['Assigned', 'Resolved', 'Closed'],
  Resolved: ['Closed', 'Reopened', 'In Progress'],
  Reopened: ['Assigned', 'In Progress', 'Resolved', 'Closed'],
  Closed: ['Reopened'],
};

const POPULATE = [
  { path: 'flat', select: 'flatNumber tower' },
  { path: 'raisedBy', select: 'name' },
  { path: 'assignedTo', select: 'name isDutyManager' },
  { path: 'duplicateOf', select: 'ticketNo title status' },
  { path: 'relatedComplaints', select: 'ticketNo title status' },
];

// Response timer: time left to first response, by urgency.
function withSla(doc) {
  const c = doc.toObject ? doc.toObject() : doc;
  const dueAt = new Date(new Date(c.createdAt).getTime() + SLA_MINUTES[c.urgency] * 60000);
  const responded = !!c.respondedAt;
  const still = OPEN.includes(c.status);
  c.sla = {
    targetMinutes: SLA_MINUTES[c.urgency], dueAt, responded,
    breached: responded ? new Date(c.respondedAt) > dueAt : still && Date.now() > dueAt.getTime(),
    minutesRemaining: responded || !still ? null : Math.round((dueAt.getTime() - Date.now()) / 60000),
  };
  return c;
}

const log = (complaint, action, { from = '', to = '', note = '', by = null } = {}) =>
  History.create({ complaint: complaint._id ?? complaint, action, fromValue: from, toValue: to, note, changedBy: by });

async function newTicketNo() {
  for (let i = 0; i < 6; i += 1) {
    const no = `CMP-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!(await Complaint.exists({ ticketNo: no }))) return no;
  }
  return `CMP-${Date.now()}`;
}

function assertAccess(req, complaint) {
  if (req.user.role === 'resident' && String(complaint.flat?._id ?? complaint.flat) !== String(req.user.flat)) {
    throw new ApiError(403, 'You can only access your own complaints');
  }
}

async function load(id) {
  const c = await Complaint.findById(id);
  if (!c) throw new ApiError(404, 'Complaint not found');
  return c;
}

// Preview only: classifies without saving.
async function classify(req, res, next) {
  try {
    const t = await triageComplaint(req.body);
    res.json({ category: t.category, urgency: t.urgency, reasoning: t.reasoning, confidence: t.confidence, source: t.source,
      needsManualReview: t.needsManualReview, emergency: t.emergency });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  const file = req.file;
  try {
    if (file && !hasImageSignature(file.path)) throw new ApiError(400, 'The uploaded file is not a valid image');
    const { title, description, location = '' } = req.body;
    const flat = await Flat.findById(req.user.flat);
    if (!flat) throw new ApiError(400, 'No flat is linked to this account');

    const t = await triageComplaint({ title, description });
    const duplicates = await findDuplicates({ tower: flat.tower, flatId: flat._id, title, description, location, category: t.category });

    const complaint = await Complaint.create({
      ticketNo: await newTicketNo(), flat: flat._id, raisedBy: req.user._id, title, description, location,
      imagePath: file ? `/uploads/${file.filename}` : '',
      category: t.category, urgency: t.urgency,
      ai: { source: t.source, category: t.aiCategory ?? undefined, urgency: t.aiUrgency ?? undefined,
        reasoning: t.reasoning, confidence: t.confidence, needsManualReview: t.needsManualReview },
      emergencyKeywords: t.emergency.keywords,
      escalatedToDutyManager: t.emergency.isEmergency,
      duplicateOf: duplicates[0]?._id ?? null,
      relatedComplaints: duplicates.map((d) => d._id),
    });
    await log(complaint, 'created', { to: 'New', note: `Classified as ${t.category} / ${t.urgency} (${t.source})`, by: req.user._id });

    if (t.emergency.isEmergency) {
      const manager = await User.findOne({ role: 'helpdesk', isDutyManager: true, isActive: true });
      await log(complaint, 'escalated', { to: 'Duty manager', note: `Emergency keyword(s): ${t.emergency.keywords.join(', ')}` });
      if (manager) {
        complaint.assignedTo = manager._id;
        complaint.status = 'Assigned';
        complaint.respondedAt = new Date();
        await complaint.save();
        await ComplaintAssignment.create({ complaint: complaint._id, assignedTo: manager._id, assignedBy: manager._id, note: 'Automatic emergency escalation' });
        await log(complaint, 'assigned', { to: manager.name, note: 'Auto-assigned to duty manager', from: 'New' });
      }
    }

    for (const d of duplicates) {
      await Complaint.updateOne({ _id: d._id }, { $addToSet: { relatedComplaints: complaint._id } });
      await log(d, 'linked_duplicate', { to: complaint.ticketNo, note: 'A similar complaint was raised (not closed automatically)' });
    }
    if (duplicates.length) await log(complaint, 'linked_duplicate', { to: duplicates.map((d) => d.ticketNo).join(', '), note: 'Possible duplicate (not closed automatically)' });

    await complaint.populate(POPULATE);
    res.status(201).json({ complaint: withSla(complaint), duplicatesLinked: duplicates.length });
  } catch (err) {
    if (file) fs.unlink(file.path, () => {});
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    const complaints = await Complaint.find({ flat: req.user.flat }).sort({ createdAt: -1 }).populate(POPULATE).limit(200);
    res.json({ complaints: complaints.map(withSla) });
  } catch (err) { next(err); }
}

async function listAll(req, res, next) {
  try {
    const { status, urgency, category, assignedTo, q } = req.query;
    const filter = {};
    if (status === 'open') filter.status = { $in: OPEN };
    else if (status) filter.status = String(status);
    if (urgency) filter.urgency = String(urgency);
    if (category) filter.category = String(category);
    if (assignedTo === 'unassigned') filter.assignedTo = null;
    else if (assignedTo) filter.assignedTo = String(assignedTo);
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { ticketNo: rx }, { description: rx }];
    }
    const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).populate(POPULATE).limit(300);
    res.json({ complaints: complaints.map(withSla) });
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const c = await load(req.params.id);
    assertAccess(req, c);
    await c.populate(POPULATE);
    const history = await History.find({ complaint: c._id }).sort({ createdAt: 1 }).populate('changedBy', 'name');
    res.json({ complaint: withSla(c), history });
  } catch (err) { next(err); }
}

async function assignees(req, res, next) {
  try {
    const staff = await User.find({ role: 'helpdesk', isActive: true }).select('name isDutyManager').sort({ name: 1 });
    res.json({ staff });
  } catch (err) { next(err); }
}

async function assign(req, res, next) {
  try {
    const c = await load(req.params.id);
    if (c.status === 'Closed') throw new ApiError(409, 'A closed complaint cannot be assigned');
    const staff = await User.findOne({ _id: req.body.assignedTo, role: 'helpdesk', isActive: true });
    if (!staff) throw new ApiError(400, 'Assignee must be an active help desk staff member');
    const prev = c.assignedTo ? (await User.findById(c.assignedTo))?.name : '';
    await ComplaintAssignment.updateMany({ complaint: c._id, active: true }, { active: false });
    await ComplaintAssignment.create({ complaint: c._id, assignedTo: staff._id, assignedBy: req.user._id, note: req.body.note || '' });
    c.assignedTo = staff._id;
    if (['New', 'Reopened'].includes(c.status)) { await log(c, 'status_change', { from: c.status, to: 'Assigned', by: req.user._id }); c.status = 'Assigned'; }
    if (!c.respondedAt) c.respondedAt = new Date();
    await c.save();
    await log(c, 'assigned', { from: prev, to: staff.name, note: req.body.note || '', by: req.user._id });
    await c.populate(POPULATE);
    res.json({ complaint: withSla(c) });
  } catch (err) { next(err); }
}

async function setCategory(req, res, next) {
  try {
    const c = await load(req.params.id);
    const from = c.category;
    c.category = req.body.category;
    c.ai.source = 'manual';
    c.ai.needsManualReview = false;
    await c.save();
    await log(c, 'category_change', { from, to: c.category, by: req.user._id });
    await c.populate(POPULATE);
    res.json({ complaint: withSla(c) });
  } catch (err) { next(err); }
}

async function setUrgency(req, res, next) {
  try {
    const c = await load(req.params.id);
    // Safety rules cannot be overridden downwards.
    if (c.emergencyKeywords.length && req.body.urgency !== 'Critical') {
      throw new ApiError(409, 'Emergency complaints (fire, gas leak, lift stuck, electric shock) must stay Critical');
    }
    const from = c.urgency;
    c.urgency = req.body.urgency;
    c.ai.needsManualReview = false;
    await c.save();
    await log(c, 'urgency_change', { from, to: c.urgency, by: req.user._id });
    await c.populate(POPULATE);
    res.json({ complaint: withSla(c) });
  } catch (err) { next(err); }
}

async function setStatus(req, res, next) {
  try {
    const c = await load(req.params.id);
    const to = req.body.status;
    if (to === c.status) throw new ApiError(409, `Complaint is already ${to}`);
    if (!NEXT[c.status].includes(to)) throw new ApiError(409, `Cannot move a complaint from ${c.status} to ${to}`);
    const from = c.status;
    c.status = to;
    if (!c.respondedAt) c.respondedAt = new Date();
    if (['Resolved', 'Closed'].includes(to) && !c.resolvedAt) c.resolvedAt = new Date();
    if (to === 'Reopened') { c.resolvedAt = null; c.reopenCount += 1; }
    await c.save();
    await log(c, 'status_change', { from, to, note: req.body.note || '', by: req.user._id });
    await c.populate(POPULATE);
    res.json({ complaint: withSla(c) });
  } catch (err) { next(err); }
}

async function rate(req, res, next) {
  try {
    const c = await load(req.params.id);
    assertAccess(req, c);
    if (!['Resolved', 'Closed'].includes(c.status)) throw new ApiError(409, 'Only resolved complaints can be rated');
    if (c.rating) throw new ApiError(409, 'This complaint has already been rated');
    c.rating = req.body.rating;
    c.ratingComment = req.body.comment || '';
    await c.save();
    await log(c, 'rated', { to: String(c.rating), note: c.ratingComment, by: req.user._id });
    res.json({ complaint: withSla(c) });
  } catch (err) { next(err); }
}

async function reopen(req, res, next) {
  try {
    const c = await load(req.params.id);
    assertAccess(req, c);
    if (c.status !== 'Resolved') throw new ApiError(409, 'Only resolved complaints can be reopened');
    c.status = 'Reopened';
    c.resolvedAt = null;
    c.reopenCount += 1;
    await c.save();
    await log(c, 'status_change', { from: 'Resolved', to: 'Reopened', note: req.body.note || 'Reopened by resident', by: req.user._id });
    await c.populate(POPULATE);
    res.json({ complaint: withSla(c) });
  } catch (err) { next(err); }
}

module.exports = { classify, create, listMine, listAll, getOne, assignees, assign, setCategory, setUrgency, setStatus, rate, reopen, withSla, SLA_MINUTES, OPEN };
