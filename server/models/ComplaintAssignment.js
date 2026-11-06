const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assignmentSchema.index({ complaint: 1, active: 1 });

module.exports = mongoose.model('ComplaintAssignment', assignmentSchema);
