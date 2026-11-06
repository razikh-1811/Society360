const Flat = require('../models/Flat');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const Complaint = require('../models/Complaint');
const Notice = require('../models/Notice');
const { ApiError } = require('../middleware/errorHandler');
const { describeBill, round2 } = require('../utils/billing');

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

module.exports = { residentDashboard };
