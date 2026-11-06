const crypto = require('crypto');
const Flat = require('../models/Flat');
const Bill = require('../models/Bill');
const BankTransaction = require('../models/BankTransaction');
const ReconciliationBatch = require('../models/ReconciliationBatch');
const { ApiError } = require('../middleware/errorHandler');
const { applyPayment } = require('./paymentService');
const { matchTransaction } = require('./matcher');
const { normalizeAmount, normalizeUpi, normalizeRef, parseDate, fingerprint } = require('../utils/normalize');
const { round2 } = require('../utils/billing');

const ALIASES = {
  txnId: ['txn id', 'transaction id', 'txnid', 'id', 'utr', 'txn no', 'transaction no'],
  date: ['date', 'txn date', 'transaction date', 'value date'],
  description: ['description', 'narration', 'particulars', 'remarks'],
  amount: ['amount', 'credit', 'credit amount', 'deposit', 'deposit amount'],
  type: ['type', 'dr/cr', 'cr/dr', 'txn type', 'transaction type'],
  upi: ['upi id', 'upi', 'vpa', 'payer upi', 'payer vpa', 'upi/vpa'],
  reference: ['reference', 'ref', 'ref no', 'reference no', 'reference number', 'utr/ref'],
};

function pick(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const k = keys.find((key) => key.trim().toLowerCase().replace(/[_\s]+/g, ' ') === alias);
    if (k !== undefined && String(row[k] ?? '').trim() !== '') return row[k];
  }
  return '';
}

// Normalizes one CSV row. Returns { skip } for debits, { invalid } for unusable rows, or { tx }.
function normalizeRow(row) {
  const rawAmount = pick(row, ALIASES.amount);
  const type = String(pick(row, ALIASES.type)).trim().toLowerCase();
  if (/^(dr|debit|d)$/.test(type) || /^-/.test(String(rawAmount).trim())) return { skip: true };

  const amount = normalizeAmount(rawAmount);
  const date = parseDate(pick(row, ALIASES.date));
  const txnId = String(pick(row, ALIASES.txnId)).trim();
  if (!txnId) return { invalid: 'Missing transaction ID' };
  if (!date) return { invalid: 'Missing or unreadable date' };
  if (!Number.isFinite(amount) || amount <= 0) return { invalid: 'Missing or invalid amount' };

  const upiId = normalizeUpi(pick(row, ALIASES.upi));
  const reference = normalizeRef(pick(row, ALIASES.reference));
  const description = String(pick(row, ALIASES.description)).trim().slice(0, 300);
  const tx = { txnId, date, amount, upiId, reference, description };
  tx.fingerprint = fingerprint(tx);
  return { tx };
}

const paymentRef = (fp) => `BANK-${fp.slice(0, 20).toUpperCase()}`;

async function loadContext() {
  const [flats, bills] = await Promise.all([Flat.find().lean(), Bill.find({ status: { $ne: 'paid' } }).lean()]);
  return {
    flats: flats.map((f) => ({ id: f._id, flatNumber: f.flatNumber, upiIds: f.upiIds || [] })),
    openBills: bills.map((b) => ({ id: b._id, flat: b.flat, period: b.period, balance: round2(b.amount - b.paidAmount) })).filter((b) => b.balance > 0),
  };
}

async function processStatement({ rows, filename, user }) {
  const batchId = crypto.randomUUID();
  const counts = { rows: rows.length, matched: 0, manualReview: 0, unmatched: 0, duplicates: 0, invalid: 0, skippedDebits: 0 };
  const duplicates = [];
  const invalidRows = [];
  const parsed = [];

  rows.forEach((row, i) => {
    const r = normalizeRow(row);
    if (r.skip) counts.skippedDebits += 1;
    else if (r.invalid) { counts.invalid += 1; invalidRows.push({ row: i + 2, reason: r.invalid }); } // +2: header row + 1-based
    else parsed.push(r.tx);
  });

  // Duplicate detection: against stored transactions (fingerprint or bank txn ID) and within this file.
  const existing = await BankTransaction.find({
    $or: [{ fingerprint: { $in: parsed.map((t) => t.fingerprint) } }, { txnId: { $in: parsed.map((t) => t.txnId) } }],
  }).select('fingerprint txnId status');
  const knownFp = new Set(existing.map((e) => e.fingerprint));
  const knownId = new Set(existing.map((e) => e.txnId));
  const seenInFile = new Set();

  const ctx = await loadContext();
  const processed = [];

  for (const tx of parsed) {
    const dupReason = knownFp.has(tx.fingerprint) || knownId.has(tx.txnId)
      ? 'Already processed in an earlier upload'
      : seenInFile.has(tx.fingerprint) || seenInFile.has(`id:${tx.txnId}`) ? 'Repeated within this file' : null;
    if (dupReason) {
      counts.duplicates += 1;
      duplicates.push({ txnId: tx.txnId, amount: tx.amount, reason: dupReason });
      continue;
    }
    seenInFile.add(tx.fingerprint); seenInFile.add(`id:${tx.txnId}`);

    const m = matchTransaction(tx, ctx);
    let doc;
    try {
      // The unique fingerprint index is the race-safe claim on this transaction.
      doc = await BankTransaction.create({
        ...tx, status: m.status, matchReason: m.reason, matchedFlat: m.matchedFlat,
        candidateFlats: m.candidateFlats, batchId,
      });
    } catch (err) {
      if (err.code === 11000) {
        counts.duplicates += 1;
        duplicates.push({ txnId: tx.txnId, amount: tx.amount, reason: 'Processed concurrently by another upload' });
        continue;
      }
      throw err;
    }

    if (m.status === 'matched') {
      try {
        const { payment } = await applyPayment({
          billId: m.bill.id, amount: tx.amount, method: 'bank_reconciliation',
          txnRef: paymentRef(tx.fingerprint), bankTransaction: doc._id, recordedBy: user?._id ?? null, paidAt: tx.date,
        });
        doc.payment = payment._id;
        await doc.save();
        m.bill.balance = round2(m.bill.balance - tx.amount); // keep in-memory balances honest within the batch
        if (m.bill.balance <= 0) ctx.openBills = ctx.openBills.filter((b) => b.id !== m.bill.id);
      } catch (err) {
        doc.status = 'manual_review';
        doc.matchedFlat = null;
        doc.matchReason = `Auto-posting failed (${err.message}); needs manual review`;
        await doc.save();
        m.status = 'manual_review';
      }
    }
    if (m.status === 'matched') counts.matched += 1;
    else if (m.status === 'manual_review') counts.manualReview += 1;
    else counts.unmatched += 1;
    processed.push(doc);
  }

  const batch = await ReconciliationBatch.create({ batchId, filename, uploadedBy: user?._id ?? null, counts, duplicates, invalidRows });
  return { batch, transactions: processed };
}

// Manual verification of a manual_review / unmatched transaction.
async function resolveTransaction({ id, action, flatId, billId, user }) {
  const tx = await BankTransaction.findById(id);
  if (!tx) throw new ApiError(404, 'Transaction not found');
  const OPEN = ['manual_review', 'unmatched'];
  if (!OPEN.includes(tx.status)) throw new ApiError(409, `Transaction is already ${tx.status}; it cannot be changed`);

  if (action === 'reject') {
    const claimed = await BankTransaction.findOneAndUpdate(
      { _id: id, status: { $in: OPEN } },
      { $set: { status: 'rejected', reviewedBy: user._id, reviewedAt: new Date(), matchReason: 'Rejected by reviewer: not a maintenance payment' } },
      { new: true });
    if (!claimed) throw new ApiError(409, 'Transaction was already processed');
    return claimed;
  }

  // approve
  const flat = await Flat.findById(flatId);
  if (!flat) throw new ApiError(404, 'Flat not found');
  let bill;
  if (billId) {
    bill = await Bill.findById(billId);
    if (!bill || String(bill.flat) !== String(flat._id)) throw new ApiError(400, 'That bill does not belong to the selected flat');
  } else {
    const open = (await Bill.find({ flat: flat._id, status: { $ne: 'paid' } }).sort({ period: 1 }))
      .filter((b) => round2(b.amount - b.paidAmount) >= tx.amount - 0.005);
    if (open.length === 0) throw new ApiError(409, 'Transaction amount exceeds the outstanding balance of every open bill for this flat');
    const exact = open.filter((b) => Math.abs(round2(b.amount - b.paidAmount) - tx.amount) < 0.005);
    const choice = exact.length ? exact : open;
    if (choice.length !== 1) throw new ApiError(400, 'Choose which bill this payment should be applied to');
    bill = choice[0];
  }
  if (round2(bill.amount - bill.paidAmount) < tx.amount - 0.005) throw new ApiError(409, 'Transaction amount exceeds the bill balance');

  const previous = { status: tx.status, matchReason: tx.matchReason, matchedFlat: tx.matchedFlat };
  const claimed = await BankTransaction.findOneAndUpdate(
    { _id: id, status: { $in: OPEN } },
    { $set: { status: 'matched', matchedFlat: flat._id, reviewedBy: user._id, reviewedAt: new Date(), matchReason: `Manually verified by ${user.name}` } },
    { new: true });
  if (!claimed) throw new ApiError(409, 'Transaction was already processed');

  try {
    const { payment } = await applyPayment({
      billId: bill._id, amount: tx.amount, method: 'bank_reconciliation',
      txnRef: paymentRef(tx.fingerprint), bankTransaction: tx._id, recordedBy: user._id, paidAt: tx.date,
    });
    claimed.payment = payment._id;
    await claimed.save();
    return claimed;
  } catch (err) {
    await BankTransaction.updateOne({ _id: id }, { $set: { ...previous, reviewedBy: null, reviewedAt: null } });
    throw err;
  }
}

module.exports = { processStatement, resolveTransaction, normalizeRow };
