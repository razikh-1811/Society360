const Flat = require('../models/Flat');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const Complaint = require('../models/Complaint');
const Notice = require('../models/Notice');
const { ApiError } = require('../middleware/errorHandler');
const History = require('../models/ComplaintStatusHistory');
const { describeBill, round2, daysOverdue } = require('../utils/billing');
const { withSla, OPEN: OPEN_STATUSES } = require('./complaintController');

const OPEN = ['New', 'Assigned', 'In Progress', 'Reopened'];

async function residentDashboard(req, res, next) {
  try {
    const flatId = req.user.flat;
    if (!flatId) throw new ApiError(404, 'No flat is linked to this account');
    const flat = await Flat.findById(flatId);
    const bills = (await Bill.find({ flat: flatId }).sort({ period: -1 })).map((b) => describeBill(b));
    const currentBill = bills[0] || null;
    const outstanding = round2(bills.reduce((s, b) => s + b.balance, 0));
    const lateFees = bills.reduce((s, b) => s + b.lateFee, 0);

    let paymentStatus = 'Paid';
    if (outstanding > 0) {
      if (bills.some((b) => b.isOverdue && b.balance > 0)) paymentStatus = 'Overdue';
      else if (currentBill && currentBill.status === 'partial') paymentStatus = 'Partially paid';
      else paymentStatus = 'Due';
    }

    const [openCount, openComplaints, recentPayments, notices] = await Promise.all([
      Complaint.countDocuments({ flat: flatId, status: { $in: OPEN } }),
      Complaint.find({ flat: flatId, status: { $in: OPEN } }).sort({ createdAt: -1 }).limit(3).select('ticketNo title status urgency category createdAt'),
      Payment.find({ flat: flatId }).sort({ paidAt: -1 }).limit(5).populate('bill', 'period'),
      Notice.find().sort({ createdAt: -1 }).limit(3),
    ]);

    res.json({
      resident: { name: req.user.name },
      flat: { id: flat._id, flatNumber: flat.flatNumber, tower: flat.tower, areaSqft: flat.areaSqft },
      currentBill,
      outstanding: { principal: outstanding, lateFees, totalDue: round2(outstanding + lateFees) },
      paymentStatus,
      openComplaints: { count: openCount, items: openComplaints },
      recentTransactions: recentPayments,
      notices,
    });
  } catch (err) { next(err); }
}

const URGENCY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const POP = [{ path: 'flat', select: 'flatNumber tower' }, { path: 'assignedTo', select: 'name' }];

async function helpdeskDashboard(req, res, next) {
  try {
    const grouped = await Complaint.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const by = Object.fromEntries(grouped.map((g) => [g._id, g.n]));
    const n = (k) => by[k] || 0;
    const total = grouped.reduce((s, g) => s + g.n, 0);

    const open = await Complaint.find({ status: { $in: OPEN_STATUSES } }).populate(POP);
    const withTimers = open.map(withSla);
    const queue = withTimers
      .filter((c) => !c.assignedTo)
      .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, 10);
    const timers = withTimers
      .filter((c) => !c.sla.responded)
      .sort((a, b) => a.sla.minutesRemaining - b.sla.minutesRemaining)
      .slice(0, 8);
    const activity = await History.find().sort({ createdAt: -1 }).limit(10)
      .populate('complaint', 'ticketNo title').populate('changedBy', 'name');

    res.json({
      totals: {
        total, new: n('New'), assigned: n('Assigned'), inProgress: n('In Progress'), reopened: n('Reopened'),
        critical: withTimers.filter((c) => c.urgency === 'Critical').length,
        resolved: n('Resolved') + n('Closed'),
        slaBreached: withTimers.filter((c) => c.sla.breached).length,
        needsReview: withTimers.filter((c) => c.ai?.needsManualReview).length,
      },
      assignmentQueue: queue,
      responseTimers: timers,
      recentActivity: activity,
    });
  } catch (err) { next(err); }
}

const BUCKETS = [
  { key: '0-30', label: '0–30 days', test: (d) => d <= 30 },
  { key: '31-60', label: '31–60 days', test: (d) => d >= 31 && d <= 60 },
  { key: '61-90', label: '61–90 days', test: (d) => d >= 61 && d <= 90 },
  { key: '90+', label: 'Above 90 days', test: (d) => d > 90 },
];

// All figures are computed from MongoDB on every request. Nothing is hardcoded.
async function committeeDashboard(req, res, next) {
  try {
    const now = new Date();
    const [bills, totalFlats, complaintGroups, byCategory, byUrgency, resolution, reopened] = await Promise.all([
      Bill.find().lean(),
      Flat.countDocuments(),
      Complaint.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Complaint.aggregate([{ $group: { _id: '$urgency', n: { $sum: 1 } } }]),
      Complaint.aggregate([
        { $match: { resolvedAt: { $ne: null } } },
        { $group: { _id: null, avgMs: { $avg: { $subtract: ['$resolvedAt', '$createdAt'] } }, count: { $sum: 1 } } },
      ]),
      Complaint.countDocuments({ reopenCount: { $gt: 0 } }),
    ]);

    const totalBilled = round2(bills.reduce((s, b) => s + b.amount, 0));
    const totalCollected = round2(bills.reduce((s, b) => s + b.paidAmount, 0));
    const outstanding = round2(totalBilled - totalCollected);

    const owed = new Map();
    const periods = new Map();
    const ageing = BUCKETS.map((b) => ({ bucket: b.key, label: b.label, amount: 0, flats: new Set() }));
    for (const b of bills) {
      const bal = round2(b.amount - b.paidAmount);
      owed.set(String(b.flat), round2((owed.get(String(b.flat)) || 0) + bal));
      const p = periods.get(b.period) || { period: b.period, billed: 0, collected: 0 };
      p.billed += b.amount; p.collected += b.paidAmount; periods.set(b.period, p);
      if (bal > 0.005) {
        const d = daysOverdue(b.dueDate, now);
        const bucket = ageing[BUCKETS.findIndex((x) => x.test(d))];
        bucket.amount = round2(bucket.amount + bal);
        bucket.flats.add(String(b.flat));
      }
    }
    const unpaidFlats = [...owed.values()].filter((v) => v > 0.005).length;

    const by = Object.fromEntries(complaintGroups.map((g) => [g._id, g.n]));
    const totalComplaints = complaintGroups.reduce((s, g) => s + g.n, 0);
    const openComplaints = OPEN_STATUSES.reduce((s, k) => s + (by[k] || 0), 0);

    res.json({
      generatedAt: now,
      financial: {
        totalBilled, totalCollected, outstanding,
        collectionPercentage: totalBilled ? round2((totalCollected / totalBilled) * 100) : 0,
        paidFlats: owed.size - unpaidFlats, unpaidFlats, totalFlats,
        byPeriod: [...periods.values()].sort((a, b) => a.period.localeCompare(b.period)),
      },
      ageing: ageing.map((a) => ({ bucket: a.bucket, label: a.label, amount: a.amount, flats: a.flats.size })),
      complaints: {
        total: totalComplaints,
        open: openComplaints,
        resolved: (by.Resolved || 0) + (by.Closed || 0),
        reopened,
        averageResolutionHours: resolution[0] ? round2(resolution[0].avgMs / 3600000) : 0,
        resolvedSample: resolution[0]?.count || 0,
        byCategory: byCategory.map((c) => ({ category: c._id, count: c.n })),
        byUrgency: byUrgency.map((c) => ({ urgency: c._id, count: c.n })),
      },
    });
  } catch (err) { next(err); }
}

module.exports = { residentDashboard, helpdeskDashboard, committeeDashboard };
