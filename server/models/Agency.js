const mongoose = require('mongoose');

const agencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    active: { type: Boolean, default: true },
    roleChangeVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Agency', agencySchema);
