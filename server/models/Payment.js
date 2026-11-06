const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
    flat: { type: mongoose.Schema.Types.ObjectId, ref: 'Flat', required: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ['mock_online', 'bank_reconciliation', 'seed'], required: true },
    // Unique reference prevents duplicate payment entries.
    txnRef: { type: String, required: true, unique: true },
    receiptNo: { type: String, required: true, unique: true },
    paidAt: { type: Date, required: true, default: Date.now },
    bankTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'BankTransaction', default: null },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ flat: 1, paidAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
