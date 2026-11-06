const Flat = require('../models/Flat');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const { ApiError } = require('../middleware/errorHandler');
const { describeBill, round2 } = require('../utils/billing');
const { applyPayment } = require('../services/paymentService');

async function assertFlat(flatId) {
  const flat = await Flat.findById(flatId);
  if (!flat) throw new ApiError(404, 'Flat not found');
  return flat;
}

async function listBills(req, res, next) {
  try {
    await assertFlat(req.params.flatId);
    const bills = await Bill.find({ flat: req.params.flatId }).sort({ period: -1 });
    res.json({ bills: bills.map((b) => describeBill(b)) });
  } catch (err) { next(err); }
}

async function listPayments(req, res, next) {
  try {
    await assertFlat(req.params.flatId);
    const payments = await Payment.find({ flat: req.params.flatId }).populate('bill', 'period').sort({ paidAt: -1 });
    res.json({ payments });
  } catch (err) { next(err); }
}

// Flat-wise ledger: bills are debits, payments are credits, with a running balance.
async function getLedger(req, res, next) {
  try {
    const flat = await assertFlat(req.params.flatId);
    const [bills, payments] = await Promise.all([
      Bill.find({ flat: flat._id }),
      Payment.find({ flat: flat._id }),
    ]);
    const entries = [
      ...bills.map((b) => ({ date: new Date(`${b.period}-01T00:00:00Z`), type: 'bill', description: `Maintenance bill ${b.period}`, debit: b.amount, credit: 0 })),
      ...payments.map((p) => ({ date: p.paidAt, type: 'payment', description: `Payment ${p.txnRef}`, paymentId: p._id, receiptNo: p.receiptNo, debit: 0, credit: p.amount })),
    ].sort((a, b) => a.date - b.date || (a.type === 'bill' ? -1 : 1));

    let running = 0;
    entries.forEach((e) => { running = round2(running + e.debit - e.credit); e.balance = running; });

    const described = bills.map((b) => describeBill(b));
    res.json({
      flat,
      summary: {
        totalBilled: round2(bills.reduce((s, b) => s + b.amount, 0)),
        totalPaid: round2(payments.reduce((s, p) => s + p.amount, 0)),
        outstanding: round2(described.reduce((s, b) => s + b.balance, 0)),
        lateFees: described.reduce((s, b) => s + b.lateFee, 0),
      },
      entries,
    });
  } catch (err) { next(err); }
}

// Mock online payment. No real money moves. clientRequestId makes the call idempotent.
async function mockPay(req, res, next) {
  try {
    const { billId, amount, clientRequestId } = req.body;
    const bill = await Bill.findById(billId);
    if (!bill) throw new ApiError(404, 'Bill not found');
    if (String(bill.flat) !== String(req.user.flat)) throw new ApiError(403, 'You can only pay your own flat bills');
    const flat = await Flat.findById(bill.flat);

    const { payment, duplicate } = await applyPayment({
      billId: bill._id,
      amount,
      method: 'mock_online',
      txnRef: `MOCK-${flat.flatNumber}-${clientRequestId}`,
      recordedBy: req.user._id,
    });
    const fresh = await Bill.findById(bill._id);
    res.status(duplicate ? 200 : 201).json({
      duplicate,
      message: duplicate ? 'This payment was already recorded' : 'Payment successful (demo - no real money moved)',
      payment,
      bill: describeBill(fresh),
    });
  } catch (err) { next(err); }
}

async function getReceipt(req, res, next) {
  try {
    const payment = await Payment.findById(req.params.paymentId).populate('bill', 'period amount');
    if (!payment) throw new ApiError(404, 'Payment not found');
    if (req.user.role === 'resident' && String(payment.flat) !== String(req.user.flat)) {
      throw new ApiError(403, 'You can only view your own receipts');
    }
    const flat = await Flat.findById(payment.flat);
    res.json({
      receipt: {
        receiptNo: payment.receiptNo,
        txnRef: payment.txnRef,
        paidAt: payment.paidAt,
        amount: payment.amount,
        method: payment.method,
        period: payment.bill?.period,
        flatNumber: flat.flatNumber,
        tower: flat.tower,
        ownerName: flat.ownerName,
        society: 'Society360 Township, Pune',
      },
    });
  } catch (err) { next(err); }
}

module.exports = { listBills, listPayments, getLedger, mockPay, getReceipt };
