const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');

const withdrawalSchema = new mongoose.Schema(
  {
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Processed'],
      default: 'Pending',
    },
    payoutSnapshot: {
      bankName: String,
      accountNumber: String,
      accountHolder: String,
    },
    adminNotes: { type: String, default: '', maxlength: 2000 },
    statusEvents: [{
      status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Processed'], required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      note: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now },
    }],
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

withdrawalSchema.plugin(tenantPlugin);
withdrawalSchema.index({ tenantId: 1, consultant: 1, createdAt: -1 });
withdrawalSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
