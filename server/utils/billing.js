const env = require('../config/env');

const RATE_PER_SQFT = 6.5; // client brief: maintenance = area x Rs 6.50
const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const calcMonthlyBill = (areaSqft, rate = RATE_PER_SQFT) => Math.round(areaSqft * rate);

function daysOverdue(dueDate, now = new Date()) {
  return Math.max(0, Math.floor((now - new Date(dueDate)) / DAY_MS));
}

/**
 * CONFIGURABLE DEMONSTRATION RULE (the real late-fee policy is not specified by the client).
 * lateFee = balance x (percentPerMonth / 100) x (overdueDays - graceDays) / 30
 * No fee while within the grace period, and none once the balance is zero.
 * Defaults come from LATE_FEE_GRACE_DAYS (10) and LATE_FEE_PERCENT_PER_MONTH (1.5).
 */
function calcLateFee(balance, overdueDays, cfg = {}) {
  const graceDays = cfg.graceDays ?? env.lateFeeGraceDays;
  const percentPerMonth = cfg.percentPerMonth ?? env.lateFeePercentPerMonth;
  if (balance <= 0 || overdueDays <= graceDays) return 0;
  return Math.round(balance * (percentPerMonth / 100) * ((overdueDays - graceDays) / 30));
}

function describeBill(bill, now = new Date(), cfg = {}) {
  const balance = round2(bill.amount - bill.paidAmount);
  const overdue = balance > 0 ? daysOverdue(bill.dueDate, now) : 0;
  const lateFee = calcLateFee(balance, overdue, cfg);
  return {
    id: bill._id,
    flat: bill.flat,
    period: bill.period,
    areaSqft: bill.areaSqft,
    ratePerSqft: bill.ratePerSqft,
    amount: bill.amount,
    paidAmount: bill.paidAmount,
    balance,
    dueDate: bill.dueDate,
    status: bill.status,
    daysOverdue: overdue,
    isOverdue: overdue > 0,
    lateFee,
    totalDue: round2(balance + lateFee),
  };
}

module.exports = { RATE_PER_SQFT, round2, calcMonthlyBill, daysOverdue, calcLateFee, describeBill };
