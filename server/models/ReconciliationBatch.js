const mongoose = require('mongoose');

// One record per uploaded bank statement: this is the reconciliation history.
const batchSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true, unique: true },
    filename: { type: String, default: 'statement.csv' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    counts: {
      rows: { type: Number, default: 0 },
      matched: { type: Number, default: 0 },
      manualReview: { type: Number, default: 0 },
      unmatched: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      invalid: { type: Number, default: 0 },
      skippedDebits: { type: Number, default: 0 },
    },
    duplicates: [{ txnId: String, amount: Number, reason: String }],
    invalidRows: [{ row: Number, reason: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReconciliationBatch', batchSchema);
