const mongoose = require('mongoose');

const historySchema = new mongoose.Schema(
  {
    complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
    action: { type: String, required: true }, // created, status_change, category_change, urgency_change, assigned, escalated, linked_duplicate, rated
    fromValue: { type: String, default: '' },
    toValue: { type: String, default: '' },
    note: { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system
  },
  { timestamps: true }
);

historySchema.index({ complaint: 1, createdAt: 1 });

module.exports = mongoose.model('ComplaintStatusHistory', historySchema);
