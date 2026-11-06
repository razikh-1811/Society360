const Flat = require('../models/Flat');
const Bill = require('../models/Bill');
const BankTransaction = require('../models/BankTransaction');
const ReconciliationBatch = require('../models/ReconciliationBatch');
const { ApiError } = require('../middleware/errorHandler');
const { processStatement, resolveTransaction } = require('../services/reconciliationService');
const { describeBill } = require('../utils/billing');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function upload(req, res, next) {
  try {
    const { filename, rows } = req.body;
    const { batch, transactions } = await processStatement({ rows, filename, user: req.user });
    await BankTransaction.populate(transactions, [{ path: 'matchedFlat', select: 'flatNumber' }, { path: 'candidateFlats', select: 'flatNumber' }]);
    res.status(201).json({ batch, transactions });
  } catch (err) { next(err); }
}

async function listTransactions(req, res, next) {
  try {
    const { status, batchId } = req.query;
    const filter = {};
    if (status) filter.status = String(status);
    if (batchId) filter.batchId = String(batchId);
    const [transactions, grouped] = await Promise.all([
      BankTransaction.find(filter).sort({ date: -1, createdAt: -1 }).limit(500)
        .populate('matchedFlat', 'flatNumber').populate('candidateFlats', 'flatNumber').populate('payment', 'receiptNo txnRef'),
      BankTransaction.aggregate([{ $match: batchId ? { batchId: String(batchId) } : {} }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const summary = Object.fromEntries(grouped.map((g) => [g._id, g.n]));
    res.json({ transactions, summary });
  } catch (err) { next(err); }
}

async function listBatches(req, res, next) {
  try {
    const batches = await ReconciliationBatch.find().sort({ createdAt: -1 }).limit(50).populate('uploadedBy', 'name');
    res.json({ batches });
  } catch (err) { next(err); }
}

async function getBatch(req, res, next) {
  try {
    const batch = await ReconciliationBatch.findOne({ batchId: req.params.batchId }).populate('uploadedBy', 'name');
    if (!batch) throw new ApiError(404, 'Batch not found');
    const transactions = await BankTransaction.find({ batchId: batch.batchId }).sort({ date: -1 })
      .populate('matchedFlat', 'flatNumber').populate('candidateFlats', 'flatNumber');
    res.json({ batch, transactions });
  } catch (err) { next(err); }
}

async function resolve(req, res, next) {
  try {
    const tx = await resolveTransaction({ id: req.params.id, ...req.body, user: req.user });
    await tx.populate([{ path: 'matchedFlat', select: 'flatNumber' }, { path: 'payment', select: 'receiptNo txnRef' }]);
    res.json({ transaction: tx });
  } catch (err) { next(err); }
}

// Flat search for manual verification: returns flats with their open bills.
async function searchFlats(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ flats: [] });
    const flats = await Flat.find({ flatNumber: new RegExp(escapeRegex(q), 'i') }).sort({ flatNumber: 1 }).limit(10);
    const bills = await Bill.find({ flat: { $in: flats.map((f) => f._id) }, status: { $ne: 'paid' } }).sort({ period: 1 });
    res.json({
      flats: flats.map((f) => ({
        id: f._id, flatNumber: f.flatNumber, ownerName: f.ownerName,
        openBills: bills.filter((b) => String(b.flat) === String(f._id)).map((b) => describeBill(b)),
      })),
    });
  } catch (err) { next(err); }
}

module.exports = { upload, listTransactions, listBatches, getBatch, resolve, searchFlats };
