const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const tenantPlugin = require('../security/tenantPlugin');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: { type: String, required: true, minlength: 8, maxlength: 72 },
    role: { type: String, enum: ['consultant', 'specialist', 'admin'], default: 'consultant' },
    assignmentVersion: { type: Number, default: 0, select: false },
    phone: { type: String, default: '', trim: true, maxlength: 32, match: /^[+()\d\s.-]*$/ },
    balance: { type: Number, default: 0.0, min: 0 },
    bankDetails: {
      accountHolder: { type: String, default: '', trim: true, maxlength: 120 },
      bankName: { type: String, default: '', trim: true, maxlength: 120 },
      accountNumber: { type: String, default: '', trim: true, maxlength: 40 },
      branchCode: { type: String, default: '', trim: true, maxlength: 20 },
    },
  },
  { timestamps: true }
);

userSchema.plugin(tenantPlugin);
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
