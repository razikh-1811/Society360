const mongoose = require('mongoose');

const billSchema = new mongoose.Schema(
  {
    flat: { type: mongoose.Schema.Types.ObjectId, ref: 'Flat', required: true },
    period: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // YYYY-MM
    areaSqft: { type: Number, required: true },
    ratePerSqft: { type: Number, required: true, default: 6.5 },
    amount: { type: Number, required: true, min: 0 }, // area x rate, rounded to whole rupees
    paidAmount: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
  },
  { timestamps: true }
);

billSchema.index({ flat: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Bill', billSchema);
