const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['resident', 'helpdesk', 'committee'], required: true },
    flat: { type: mongoose.Schema.Types.ObjectId, ref: 'Flat', default: null },
    phone: { type: String, trim: true },
    isDutyManager: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
