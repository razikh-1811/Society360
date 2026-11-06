const mongoose = require('mongoose');

const bankTxnSchema = new mongoose.Schema(
  {
    txnId: { type: String, required: true }, // as given in bank CSV
    // Deterministic fingerprint of date|amount|upi|reference. Unique => a transaction can never be processed twice.
    fingerprint: { type: String, required: true, unique: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    upiId: { type: String, default: '' },
    reference: { type: String, default: '' },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['matched', 'posted', 'manual_review', 'unmatched', 'duplicate', 'rejected'],
      required: true,
    },
    matchReason: { type: String, default: '' },
    matchedFlat: { type: mongoose.Schema.Types.ObjectId, ref: 'Flat', default: null },
    candidateFlats: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Flat' }],
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    batchId: { type: String, required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bankTxnSchema.index({ batchId: 1 });
bankTxnSchema.index({ status: 1 });

module.exports = mongoose.model('BankTransaction', bankTxnSchema);
