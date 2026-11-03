const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');

const workspaceMessageSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['announcement', 'lead_assignment', 'payment_received', 'withdrawal_requested', 'withdrawal_updated', 'income_paid'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentInvoice', default: null },
    withdrawal: { type: mongoose.Schema.Types.ObjectId, ref: 'Withdrawal', default: null },
    recipientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    audience: { type: String, enum: ['all_accounts', 'selected_users'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

workspaceMessageSchema.plugin(tenantPlugin);
workspaceMessageSchema.index({ tenantId: 1, audience: 1, createdAt: -1 });
workspaceMessageSchema.index({ tenantId: 1, recipientIds: 1, createdAt: -1 });

module.exports = mongoose.model('WorkspaceMessage', workspaceMessageSchema);
