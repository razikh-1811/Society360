const mongoose = require('mongoose');

const flatSchema = new mongoose.Schema(
  {
    flatNumber: { type: String, required: true, unique: true, trim: true }, // e.g. T07-1203
    tower: { type: String, required: true, trim: true }, // e.g. T07
    areaSqft: { type: Number, required: true, min: 1 },
    ownerName: { type: String, required: true, trim: true },
    // UPI IDs registered against this flat; used by reconciliation matching.
    upiIds: [{ type: String, lowercase: true, trim: true }],
  },
  { timestamps: true }
);

flatSchema.index({ tower: 1 });
flatSchema.index({ upiIds: 1 });

module.exports = mongoose.model('Flat', flatSchema);
