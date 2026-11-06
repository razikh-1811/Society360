const crypto = require('crypto');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const { ApiError } = require('../middleware/errorHandler');
const { round2 } = require('../utils/billing');

const EPS = 0.001;

const newReceiptNo = (date = new Date()) =>
  `RCT-${date.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/**
 * Single entry point for recording money against a bill (used by mock payments and bank reconciliation).
 *  - txnRef is unique: replaying the same reference returns the existing payment (idempotent, no double posting).
 *  - The bill balance update is one atomic conditional update, so concurrent requests can never overpay a bill.
 */
async function applyPayment({ billId, amount, method, txnRef, bankTransaction = null, recordedBy = null, paidAt = new Date() }) {
  amount = round2(amount);
  if (!(amount > 0)) throw new ApiError(400, 'Amount must be greater than zero');

  const existing = await Payment.findOne({ txnRef });
  if (existing) return { payment: existing, duplicate: true };

  const bill = await Bill.findOneAndUpdate(
    { _id: billId, $expr: { $lte: [{ $add: ['$paidAmount', amount] }, { $add: ['$amount', EPS] }] } },
    [
      { $set: { paidAmount: { $add: ['$paidAmount', amount] } } },
      { $set: { status: { $cond: [{ $gte: ['$paidAmount', { $subtract: ['$amount', EPS] }] }, 'paid', 'partial'] } } },
    ],
    { new: true }
  );
  if (!bill) throw new ApiError(409, 'Amount exceeds the outstanding balance, or the bill does not exist');

  try {
    const payment = await Payment.create({
      bill: bill._id, flat: bill.flat, amount, method, txnRef, receiptNo: newReceiptNo(paidAt),
      paidAt, bankTransaction, recordedBy,
    });
    return { payment, bill, duplicate: false };
  } catch (err) {
    // Roll the balance back if the payment record could not be written.
    await Bill.updateOne({ _id: bill._id }, [
      { $set: { paidAmount: { $max: [0, { $subtract: ['$paidAmount', amount] }] } } },
      { $set: { status: { $cond: [{ $lte: ['$paidAmount', EPS] }, 'unpaid', { $cond: [{ $gte: ['$paidAmount', { $subtract: ['$amount', EPS] }] }, 'paid', 'partial'] }] } } },
    ]);
    if (err.code === 11000) {
      const dup = await Payment.findOne({ txnRef });
      if (dup) return { payment: dup, duplicate: true };
    }
    throw err;
  }
}

module.exports = { applyPayment, newReceiptNo };
