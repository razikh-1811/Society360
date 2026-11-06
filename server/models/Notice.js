const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tower: { type: String, default: 'ALL' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notice', noticeSchema);
