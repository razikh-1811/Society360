/**
 * Society360 demo seed. Fictional data only.
 *   MONGODB_URI=... npm run seed
 * WARNING: clears the Society360 collections in the target database before inserting.
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Flat = require('../models/Flat');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const BankTransaction = require('../models/BankTransaction');
const ReconciliationBatch = require('../models/ReconciliationBatch');
const Complaint = require('../models/Complaint');
const ComplaintAssignment = require('../models/ComplaintAssignment');
const History = require('../models/ComplaintStatusHistory');
const Notice = require('../models/Notice');
const { calcMonthlyBill, round2 } = require('../utils/billing');
const { processStatement, resolveTransaction } = require('../services/reconciliationService');

const DEMO_PASSWORD = 'Demo@1234';
const DAY = 86400000;
const HOUR = 3600000;
const now = new Date();

// Deterministic PRNG so every seed run produces the same dataset.
let state = 20261106;
const rand = () => { state |= 0; state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const monthShift = (d, delta) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 10));
const ddmmyyyy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const slug = (name) => name.toLowerCase().replace(/[^a-z ]/g, '').trim().split(/\s+/).join('.');

// ---- Flats ---------------------------------------------------------------------------------
// overdue: days past due for the current bill (0 = not yet due). paid: rupees already paid on it.
const CLIENT_FLATS = [
  { flatNumber: 'T07-1203', area: 1150, owner: 'Neeraj Kulkarni', overdue: 0, paid: 7475, resident: 'neeraj@society360.demo' },
  { flatNumber: 'T12-0408', area: 980, owner: 'Swati Joshi', overdue: 47, paid: 0, resident: 'swati@society360.demo' },
  { flatNumber: 'T21-1601', area: 1640, owner: 'Aamir Shaikh', overdue: 18, paid: 5000, resident: 'aamir@society360.demo' },
];
const RESIDENT_FLATS = [ // synthetic flats that also have a login (used for complaints)
  { flatNumber: 'T05-0302', area: 850, owner: 'Meera Iyer', overdue: 0, full: true },
  { flatNumber: 'T05-0705', area: 1050, owner: 'Karan Malhotra', overdue: 25, paid: 0 },
  { flatNumber: 'T10-0901', area: 720, owner: 'Divya Nair', overdue: 0, full: true },
  { flatNumber: 'T10-1104', area: 980, owner: 'Imran Qureshi', overdue: 65, paid: 0, upi: ['imran.q@okicici'] },
  { flatNumber: 'T14-0203', area: 1280, owner: 'Pooja Deshpande', overdue: 0, full: true },
  { flatNumber: 'T16-1502', area: 650, owner: 'Rahul Bhosale', overdue: 40, paid: 2000 },
  { flatNumber: 'T19-0604', area: 1400, owner: 'Sneha Kulkarni', overdue: 0, full: true },
  { flatNumber: 'T24-1008', area: 850, owner: 'Vikram Chavan', overdue: 95, paid: 0 },
  { flatNumber: 'T27-1201', area: 1820, owner: 'Anjali Rane', overdue: 0, full: true },
];
// Flats designed to exercise each reconciliation outcome with the sample bank statement.
const RECON_FLATS = {
  exact1: { flatNumber: 'T03-0902', area: 1110, owner: 'Sana Pathan', overdue: 20, paid: 0, upi: ['sana.pathan@okhdfc'] },
  exact2: { flatNumber: 'T08-0404', area: 1090, owner: 'Gaurav Mehta', overdue: 12, paid: 0, upi: ['gaurav.mehta@oksbi'] },
  refBlank: { flatNumber: 'T14-1301', area: 1130, owner: 'Nisha Rao', overdue: 33, paid: 0, upi: ['nisha.rao@okicici'] },
  upiDiff: { flatNumber: 'T16-0707', area: 1170, owner: 'Faisal Khan', overdue: 41, paid: 0, upi: ['faisal.khan@okaxis'] },
  amtMismatch: { flatNumber: 'T19-1802', area: 1190, owner: 'Tanvi Shah', overdue: 28, paid: 0, upi: ['tanvi.shah@oksbi'] },
  ambA: { flatNumber: 'T22-0301', area: 1210, owner: 'Prakash Bhosale', overdue: 16, paid: 0, upi: ['bhosale.family@okaxis'] },
  ambB: { flatNumber: 'T22-0302', area: 1210, owner: 'Suman Bhosale', overdue: 16, paid: 0, upi: ['bhosale.family@okaxis'] },
  seededBank: { flatNumber: 'T26-1004', area: 1250, owner: 'Anil Gupta', overdue: 14, paid: 0, upi: ['anil.gupta@okhdfc'] },
};
const FIRST = ['Aarav', 'Vihaan', 'Ishaan', 'Kavya', 'Ananya', 'Rohit', 'Sunita', 'Manoj', 'Pallavi', 'Harsh', 'Nandini', 'Sameer', 'Rekha', 'Tushar', 'Deepa', 'Yash', 'Shruti', 'Omkar', 'Leena', 'Girish'];
const LAST = ['Patil', 'Kamble', 'Jadhav', 'Sawant', 'Pawar', 'Gokhale', 'Naik', 'Apte', 'Menon', 'Reddy', 'Sharma', 'Verma', 'Khot', 'Mane', 'Joshi'];
const TOWERS = ['T01', 'T02', 'T04', 'T06', 'T09', 'T11', 'T13', 'T15', 'T17', 'T18', 'T20', 'T23', 'T25', 'T28'];
const AREAS = [650, 720, 850, 980, 1050, 1280, 1400, 1820];
const OVERDUE = [8, 15, 25, 38, 52, 70, 85, 105, 130];

function genericFlats(taken) {
  const out = [];
  while (out.length < 36) {
    const tower = pick(TOWERS);
    const flatNumber = `${tower}-${String(1 + Math.floor(rand() * 18)).padStart(2, '0')}${String(1 + Math.floor(rand() * 4)).padStart(2, '0')}`;
    if (taken.has(flatNumber)) continue;
    taken.add(flatNumber);
    const owner = `${pick(FIRST)} ${pick(LAST)}`;
    const area = pick(AREAS);
    if (rand() < 0.55) out.push({ flatNumber, area, owner, overdue: 0, full: true });
    else {
      const overdue = pick(OVERDUE);
      const amount = calcMonthlyBill(area);
      out.push({ flatNumber, area, owner, overdue, paid: rand() < 0.35 ? Math.min(amount - 500, 500 * (1 + Math.floor(rand() * 8))) : 0 });
    }
  }
  return out;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') throw new Error('Refusing to seed in production without SEED_FORCE=true');
  await mongoose.connect(uri);
  await Promise.all([User, Flat, Bill, Payment, BankTransaction, ReconciliationBatch, Complaint, ComplaintAssignment, History, Notice].map((m) => m.deleteMany({})));

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---- Staff, committee --------------------------------------------------------------------
  const staff = await User.create([
    { name: 'Priya Deshmukh', email: 'helpdesk@society360.demo', passwordHash, role: 'helpdesk' },
    { name: 'Rohan Patil (Duty Manager)', email: 'dutymanager@society360.demo', passwordHash, role: 'helpdesk', isDutyManager: true },
    { name: 'Sunil More', email: 'helpdesk2@society360.demo', passwordHash, role: 'helpdesk' },
    { name: 'Anita Pawar', email: 'helpdesk3@society360.demo', passwordHash, role: 'helpdesk' },
  ]);
  const [desk, dutyManager, desk2, desk3] = staff;
  await User.create({ name: 'Committee Treasurer', email: 'committee@society360.demo', passwordHash, role: 'committee' });

  // ---- Flats, bills, payments --------------------------------------------------------------
  const specs = [...CLIENT_FLATS, ...RESIDENT_FLATS, ...Object.values(RECON_FLATS)];
  const taken = new Set(specs.map((s) => s.flatNumber));
  specs.push(...genericFlats(taken));

  const flats = {};
  const bills = [];
  const payments = [];
  let receiptSeq = 1;
  const receipt = (date) => `RCT-${date.toISOString().slice(0, 10).replace(/-/g, '')}-${String(receiptSeq++).padStart(5, '0')}`;

  for (const s of specs) {
    const amount = calcMonthlyBill(s.area);
    const flatDoc = await Flat.create({
      flatNumber: s.flatNumber, tower: s.flatNumber.split('-')[0], areaSqft: s.area, ownerName: s.owner,
      upiIds: s.upi || [`${slug(s.owner)}@okhdfc`],
    });
    flats[s.flatNumber] = flatDoc;

    const due = s.overdue > 0 ? new Date(now.getTime() - s.overdue * DAY) : new Date(now.getTime() + 4 * DAY);
    const paid = s.full ? amount : s.paid || 0;
    const anchorPeriod = ym(due);
    const anchorDate = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
    const mk = (period, dueDate, paidAmount) => ({
      flat: flatDoc._id, period, areaSqft: s.area, ratePerSqft: 6.5, amount, paidAmount, dueDate,
      status: paidAmount >= amount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
      createdAt: new Date(`${period}-01T06:00:00Z`), updatedAt: new Date(`${period}-01T06:00:00Z`),
    });
    // Two earlier months, fully paid; then the current bill.
    for (const back of [2, 1]) {
      const d = monthShift(anchorDate, -back);
      bills.push(mk(ym(d), d, amount));
      const paidAt = new Date(d.getTime() - 3 * DAY);
      payments.push({ flat: flatDoc._id, period: ym(d), amount, paidAt, txnRef: `SEED-${s.flatNumber}-${ym(d)}`, receiptNo: receipt(paidAt), method: 'seed' });
    }
    bills.push(mk(anchorPeriod, anchorDate, paid));
    if (paid > 0) {
      const paidAt = new Date(now.getTime() - (s.full ? 2 : 10) * DAY);
      payments.push({ flat: flatDoc._id, period: anchorPeriod, amount: paid, paidAt, txnRef: `SEED-${s.flatNumber}-${anchorPeriod}`, receiptNo: receipt(paidAt), method: 'seed' });
    }
  }
  const billDocs = await Bill.insertMany(bills, { timestamps: false });
  const billByKey = new Map(billDocs.map((b) => [`${b.flat}|${b.period}`, b]));
  await Payment.insertMany(payments.map((p) => ({
    bill: billByKey.get(`${p.flat}|${p.period}`)._id, flat: p.flat, amount: p.amount, method: p.method, txnRef: p.txnRef, receiptNo: p.receiptNo, paidAt: p.paidAt,
  })), { timestamps: false });

  // ---- Resident logins ---------------------------------------------------------------------
  const residentDefs = [
    ...CLIENT_FLATS.map((c) => ({ name: c.owner, email: c.resident, flat: c.flatNumber })),
    ...RESIDENT_FLATS.map((r, i) => ({ name: r.owner, email: `resident${i + 4}@society360.demo`, flat: r.flatNumber })),
  ];
  const residents = [];
  for (const r of residentDefs) {
    residents.push(await User.create({ name: r.name, email: r.email, passwordHash, role: 'resident', flat: flats[r.flat]._id, phone: `98${String(Math.floor(rand() * 1e8)).padStart(8, '0')}` }));
  }

  // ---- Notices -----------------------------------------------------------------------------
  await Notice.insertMany([
    { title: 'Water tank cleaning on Saturday', body: 'Water supply will be interrupted from 10 AM to 2 PM for scheduled tank cleaning.', postedBy: desk._id },
    { title: 'Maintenance due date reminder', body: 'Monthly maintenance is due by the 10th. Pay online from the Billing page.', postedBy: desk._id },
    { title: 'Lift servicing in Towers 7 and 12', body: 'Annual lift servicing will take place on weekdays between 11 AM and 1 PM.', postedBy: desk._id },
  ]);

  // ---- Complaints (with history) -----------------------------------------------------------
  const staffById = { desk, dutyManager, desk2, desk3 };
  const C = [ // [resident idx, title, description, category, urgency, location, status, ageHours, staff, extras]
    [3, 'Corridor lights not working', 'Three corridor lights are off on our floor since last night', 'Electrical', 'Medium', 'Corridor', 'In Progress', 40, 'desk'],
    [4, 'Corridor lights are off', 'The corridor lights on the seventh floor are not working since last night', 'Electrical', 'Medium', 'Corridor', 'New', 20, null, { dupOf: 0, source: 'gemini' }],
    [0, 'Water leaking from bathroom ceiling', 'Water is dripping from the ceiling of my bathroom since yesterday', 'Plumbing', 'High', 'Bathroom', 'In Progress', 30, 'desk2'],
    [1, 'Lift makes grinding noise', 'The lift in our tower makes a loud grinding noise between floors', 'Lift', 'High', 'Lift', 'Assigned', 18, 'desk3'],
    [2, 'Garbage not collected', 'Garbage has not been collected from our floor refuse area for two days', 'Cleaning', 'Medium', 'Refuse area', 'Resolved', 120, 'desk', { resolveH: 30, rating: 4 }],
    [5, 'Low water pressure', 'Water pressure in all taps is very low since the morning', 'Plumbing', 'Medium', 'Kitchen', 'Closed', 200, 'desk2', { resolveH: 26, rating: 5 }],
    [6, 'Main gate barrier not closing', 'The boom barrier at the main gate does not close fully after vehicles pass', 'Security', 'High', 'Main gate', 'Resolved', 90, 'dutyManager', { resolveH: 5, rating: 3 }],
    [7, 'Staircase not cleaned', 'The staircase between floors 4 and 6 has not been cleaned for three days', 'Cleaning', 'Low', 'Staircase', 'New', 8, null],
    [8, 'Noise from club house late at night', 'Loud music from the club house continues well after 10 PM', 'Other', 'Low', 'Club house', 'New', 12, null, { source: 'fallback' }],
    [9, 'Street light off near gate', 'The street light near the tower gate is off, the area is very dark at night', 'Electrical', 'Medium', 'Tower gate', 'In Progress', 55, 'desk'],
    [10, 'Parking slot encroached', 'An outside vehicle is parked in my allotted parking slot every day', 'Security', 'Medium', 'Parking', 'Assigned', 26, 'desk2'],
    [0, 'Frequent power trips', 'The MCB trips every evening when two air conditioners are on', 'Electrical', 'High', 'Living room', 'Resolved', 150, 'desk', { resolveH: 22, rating: 5 }],
    [1, 'Blocked drain in utility area', 'The drain in the utility area is blocked and water is overflowing', 'Plumbing', 'High', 'Utility', 'Reopened', 170, 'desk3', { resolveH: 20, reopen: 1 }],
    [2, 'Strange smell from lift lobby', 'There is a bad smell coming from the lift lobby on our floor', 'Cleaning', 'Low', 'Lift lobby', 'Closed', 260, 'desk', { resolveH: 40, rating: 4 }],
    [4, 'Unknown person loitering near parking', 'An unknown person has been loitering near the visitor parking since evening', 'Security', 'High', 'Parking', 'Resolved', 100, 'dutyManager', { resolveH: 3, rating: 5 }],
    [3, 'Lift stuck with passengers', 'Lift stuck on the 14th floor with two residents inside', 'Lift', 'Critical', 'Lift', 'Resolved', 70, 'dutyManager', { resolveH: 1, rating: 5, emergency: ['Lift stuck'] }],
    [6, 'Electric shock from bathroom switch board', 'My son got an electric shock from the bathroom switch board', 'Electrical', 'Critical', 'Bathroom', 'Closed', 130, 'dutyManager', { resolveH: 2, rating: 4, emergency: ['Electric shock'] }],
    [8, 'Smoke and fire in refuse chute room', 'Smoke and a small fire in the refuse chute room on the ground floor', 'Other', 'Critical', 'Refuse chute room', 'In Progress', 2, 'dutyManager', { emergency: ['Fire'] }],
    [9, 'Gas leak smell in corridor', 'Strong gas leak smell in the corridor near the kitchen riser', 'Other', 'Critical', 'Corridor', 'Assigned', 1, 'dutyManager', { emergency: ['Gas leak'] }],
    [7, 'Water tank overflow', 'The terrace water tank overflows for an hour every morning', 'Plumbing', 'Medium', 'Terrace', 'Resolved', 300, 'desk2', { resolveH: 52, rating: 3 }],
    [5, 'Intercom not working', 'The intercom in our flat does not ring when the gate calls', 'Other', 'Low', 'Flat', 'Closed', 340, 'desk3', { resolveH: 60, rating: 4 }],
    [10, 'CCTV camera facing wrong direction', 'The CCTV camera near tower entrance is facing the wall', 'Security', 'Medium', 'Tower entrance', 'In Progress', 48, 'desk3'],
    [0, 'Pest control for garden area', 'Mosquito breeding is visible in the garden area near our tower', 'Cleaning', 'Low', 'Garden', 'Closed', 400, 'desk', { resolveH: 70, rating: 5 }],
    [2, 'Water meter reading seems incorrect', 'The water meter reading is much higher than our actual usage', 'Other', 'Medium', 'Meter room', 'New', 5, null, { source: 'fallback' }],
  ];
  const ORDER = ['New', 'Assigned', 'In Progress', 'Resolved', 'Closed'];
  const complaintDocs = [];
  const historyDocs = [];
  const assignmentDocs = [];
  const ids = C.map(() => new mongoose.Types.ObjectId());

  C.forEach((row, i) => {
    const [ri, title, description, category, urgency, location, status, ageH, staffKey, x = {} ] = row;
    const user = residents[ri];
    const created = new Date(now.getTime() - ageH * HOUR);
    const assignee = staffKey ? staffById[staffKey] : null;
    const respondedAt = assignee ? new Date(created.getTime() + (urgency === 'Critical' ? 4 : 50) * 60000) : null;
    const resolvedAt = x.resolveH ? new Date(created.getTime() + x.resolveH * HOUR) : null;
    const emergency = x.emergency || [];
    const source = emergency.length ? 'safety_rule' : x.source || 'gemini';
    const cid = ids[i];
    complaintDocs.push({
      _id: cid, ticketNo: `CMP-${100200 + i}`, flat: user.flat, raisedBy: user._id, title, description, location, category, urgency, status,
      ai: {
        source, category: source === 'fallback' ? undefined : category, urgency: source === 'fallback' ? undefined : urgency,
        reasoning: source === 'fallback' ? 'Automatic classification was unavailable, so this complaint needs manual review by the help desk.'
          : emergency.length ? `Safety rule: emergency keyword detected (${emergency.join(', ')}).` : `Classified as ${category} with ${urgency.toLowerCase()} urgency based on the description.`,
        confidence: source === 'fallback' ? null : emergency.length ? 0.97 : Math.round((0.72 + rand() * 0.25) * 100) / 100,
        needsManualReview: source === 'fallback',
      },
      emergencyKeywords: emergency, escalatedToDutyManager: emergency.length > 0,
      assignedTo: assignee ? assignee._id : null,
      duplicateOf: x.dupOf !== undefined ? ids[x.dupOf] : null,
      relatedComplaints: x.dupOf !== undefined ? [ids[x.dupOf]] : C.map((r, j) => (r[9]?.dupOf === i ? ids[j] : null)).filter(Boolean),
      respondedAt, resolvedAt: ['Resolved', 'Closed'].includes(status) ? resolvedAt : null, reopenCount: x.reopen || 0,
      rating: x.rating || null, ratingComment: x.rating ? (x.rating >= 4 ? 'Resolved quickly, thank you.' : 'Fixed, but took longer than expected.') : '',
      createdAt: created, updatedAt: resolvedAt || respondedAt || created,
    });

    const h = (action, at, o = {}) => historyDocs.push({ complaint: cid, action, createdAt: at, updatedAt: at, fromValue: o.from || '', toValue: o.to || '', note: o.note || '', changedBy: o.by === undefined ? null : o.by });
    h('created', created, { to: 'New', by: user._id, note: `Classified as ${category} / ${urgency} (${source})` });
    if (emergency.length) h('escalated', new Date(created.getTime() + 60000), { to: 'Duty manager', note: `Emergency keyword(s): ${emergency.join(', ')}` });
    if (x.dupOf !== undefined) h('linked_duplicate', new Date(created.getTime() + 1000), { to: C[x.dupOf] && `CMP-${100200 + x.dupOf}`, note: 'Possible duplicate (not closed automatically)' });
    const reached = status === 'Reopened' ? 3 : ORDER.indexOf(status);
    if (assignee) {
      assignmentDocs.push({ complaint: cid, assignedTo: assignee._id, assignedBy: emergency.length ? assignee._id : desk._id, note: emergency.length ? 'Automatic emergency escalation' : '', active: true, createdAt: respondedAt, updatedAt: respondedAt });
      h('assigned', respondedAt, { from: 'New', to: assignee.name, by: emergency.length ? null : desk._id });
      if (reached >= 1) h('status_change', respondedAt, { from: 'New', to: 'Assigned', by: desk._id });
    }
    if (reached >= 2) h('status_change', new Date(respondedAt.getTime() + 2 * HOUR), { from: 'Assigned', to: 'In Progress', by: assignee._id });
    if (reached >= 3) h('status_change', resolvedAt, { from: 'In Progress', to: 'Resolved', by: assignee._id, note: 'Work completed' });
    if (x.rating) h('rated', new Date(resolvedAt.getTime() + 3 * HOUR), { to: String(x.rating), by: user._id });
    if (status === 'Closed') h('status_change', new Date(resolvedAt.getTime() + 24 * HOUR), { from: 'Resolved', to: 'Closed', by: desk._id });
    if (status === 'Reopened') h('status_change', new Date(resolvedAt.getTime() + 6 * HOUR), { from: 'Resolved', to: 'Reopened', by: user._id, note: 'Problem has returned' });
  });
  await Complaint.insertMany(complaintDocs, { timestamps: false });
  await History.insertMany(historyDocs, { timestamps: false });
  await ComplaintAssignment.insertMany(assignmentDocs, { timestamps: false });

  // ---- Bank statement history: run through the real reconciliation pipeline ----------------
  const bal = async (flatNumber) => { const b = await Bill.findOne({ flat: flats[flatNumber]._id, status: { $ne: 'paid' } }); return round2(b.amount - b.paidAmount); };
  const octDate = (daysAgo) => ddmmyyyy(new Date(now.getTime() - daysAgo * DAY));
  const seededRows = [
    { 'Txn ID': 'HDFC24110001', Date: octDate(9), Description: 'UPI/CR/anil.gupta/MAINT', Amount: String(await bal('T26-1004')), Type: 'CR', 'UPI ID': 'anil.gupta@okhdfc', Reference: 'T26-1004 MAINT' },
    { 'Txn ID': 'HDFC24110002', Date: octDate(9), Description: 'UPI/CR/imran.q', Amount: '4321.00', Type: 'CR', 'UPI ID': 'imran.q@okicici', Reference: 'T10-1104' },
    { 'Txn ID': 'HDFC24110003', Date: octDate(8), Description: 'UPI/CR/ravi.kumar/DONATION', Amount: '2500.00', Type: 'CR', 'UPI ID': 'ravi.kumar@oksbi', Reference: 'DONATION' },
    { 'Txn ID': 'HDFC24110004', Date: octDate(8), Description: 'NEFT/VENDOR REFUND', Amount: '1200.00', Type: 'CR', 'UPI ID': '', Reference: 'REFUND' },
    { 'Txn ID': 'HDFC24110005', Date: octDate(8), Description: 'ECS/ELECTRICITY', Amount: '15000.00', Type: 'DR', 'UPI ID': '', Reference: 'MSEDCL' },
  ];
  const { batch } = await processStatement({ rows: seededRows, filename: 'hdfc-statement-previous-week.csv', user: desk });
  const refund = await BankTransaction.findOne({ txnId: 'HDFC24110004' });
  await resolveTransaction({ id: refund._id, action: 'reject', user: desk });
  const backdate = new Date(now.getTime() - 8 * DAY);
  await ReconciliationBatch.updateOne({ _id: batch._id }, { $set: { createdAt: backdate } }, { timestamps: false });
  await BankTransaction.updateMany({ batchId: batch.batchId }, { $set: { createdAt: backdate } }, { timestamps: false });

  // ---- Sample CSV for the live demo (built from the actual database state) -------------------
  const R = RECON_FLATS;
  const today = ddmmyyyy(now);
  const csvRows = [
    ['Txn ID', 'Date', 'Description', 'Amount', 'Type', 'UPI ID', 'Reference'],
    ['HDFC24120001', today, 'UPI/CR/sana.pathan/MAINT', await bal(R.exact1.flatNumber), 'CR', R.exact1.upi[0], `MAINT ${R.exact1.flatNumber}`],
    ['HDFC24120002', today, 'UPI/CR/gaurav.mehta/MAINT', await bal(R.exact2.flatNumber), 'CR', R.exact2.upi[0], `MAINT-${R.exact2.flatNumber}`],
    ['HDFC24120003', today, 'UPI/CR/nisha.rao', await bal(R.refBlank.flatNumber), 'CR', R.refBlank.upi[0], ''],
    ['HDFC24120004', today, 'UPI/CR/someone.else', await bal(R.upiDiff.flatNumber), 'CR', 'someone.else@okaxis', R.upiDiff.flatNumber],
    ['HDFC24120005', today, 'UPI/CR/tanvi.shah/MAINT', round2((await bal(R.amtMismatch.flatNumber)) - 500), 'CR', R.amtMismatch.upi[0], R.amtMismatch.flatNumber],
    ['HDFC24120006', today, 'UPI/CR/bhosale.family', await bal(R.ambA.flatNumber), 'CR', 'bhosale.family@okaxis', ''],
    ['HDFC24120007', today, 'NEFT/CR/VENDOR DEPOSIT', '54321.00', 'CR', 'unknown.payer@okicici', 'VENDOR DEPOSIT'],
    // Same bank transaction as one already processed last week => detected as a duplicate.
    [seededRows[0]['Txn ID'], seededRows[0].Date, seededRows[0].Description, seededRows[0].Amount, 'CR', seededRows[0]['UPI ID'], seededRows[0].Reference],
    ['HDFC24120008', today, 'ECS/HOUSEKEEPING SALARY', '42000.00', 'DR', '', 'SALARY'],
  ];
  const csv = csvRows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
  const targets = [path.join(__dirname, 'sample-bank-statement.csv'), path.join(__dirname, '..', '..', 'client', 'public', 'sample-bank-statement.csv')];
  for (const t of targets) { fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, csv); }

  const counts = { users: await User.countDocuments(), flats: await Flat.countDocuments(), bills: await Bill.countDocuments(), payments: await Payment.countDocuments(),
    bankTransactions: await BankTransaction.countDocuments(), complaints: await Complaint.countDocuments(), history: await History.countDocuments() };
  console.log('Seed complete:', counts);
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
  await mongoose.disconnect();
  return counts;
}

module.exports = run;
if (require.main === module) run().catch((e) => { console.error(e); process.exit(1); });
