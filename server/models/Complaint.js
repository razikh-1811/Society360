const mongoose = require('mongoose');

const CATEGORIES = ['Plumbing', 'Electrical', 'Lift', 'Security', 'Cleaning', 'Other'];
const URGENCIES = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES = ['New', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Reopened'];

const complaintSchema = new mongoose.Schema(
  {
    ticketNo: { type: String, required: true, unique: true },
    flat: { type: mongoose.Schema.Types.ObjectId, ref: 'Flat', required: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    location: { type: String, trim: true, default: '' },
    imagePath: { type: String, default: '' },
    category: { type: String, enum: CATEGORIES, default: 'Other' },
    urgency: { type: String, enum: URGENCIES, default: 'Medium' },
    status: { type: String, enum: STATUSES, default: 'New' },
    ai: {
      source: { type: String, enum: ['gemini', 'fallback', 'safety_rule', 'manual'], default: 'fallback' },
      category: String,
      urgency: String,
      reasoning: { type: String, default: '' },
      confidence: { type: Number, default: null },
      needsManualReview: { type: Boolean, default: false },
    },
    emergencyKeywords: [{ type: String }],
    escalatedToDutyManager: { type: Boolean, default: false },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', default: null },
    relatedComplaints: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Complaint' }],
    respondedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    reopenCount: { type: Number, default: 0 },
    rating: { type: Number, min: 1, max: 5, default: null },
    ratingComment: { type: String, default: '' },
  },
  { timestamps: true }
);

complaintSchema.index({ status: 1, urgency: 1 });
complaintSchema.index({ flat: 1, createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.URGENCIES = URGENCIES;
module.exports.STATUSES = STATUSES;
