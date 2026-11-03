const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');

const withdrawalSchema = new mongoose.Schema(
  {
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    actualPaidAmount: { type: Number, default: null, min: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Processed'],
      default: 'Pending',
    },
    payoutSnapshot: {
      bankName: String,
      accountNumber: String,
      accountHolder: String,
      branchCode: String,
    },
    adminNotes: { type: String, default: '', maxlength: 2000 },
    statusEvents: [{
      status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Processed'], required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      note: { type: String, default: '' },
      amount: { type: Number, default: null, min: 0 },
      createdAt: { type: Date, default: Date.now },
    }],
    processedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    clearedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

withdrawalSchema.plugin(tenantPlugin);
withdrawalSchema.index({ tenantId: 1, consultant: 1, createdAt: -1 });
withdrawalSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
