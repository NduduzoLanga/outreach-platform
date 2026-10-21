const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');

const ledgerEntrySchema = new mongoose.Schema(
  {
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    withdrawal: { type: mongoose.Schema.Types.ObjectId, ref: 'Withdrawal', default: null },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['withdrawal_reserved', 'withdrawal_approved', 'withdrawal_paid', 'withdrawal_refunded', 'commission_earned'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    availableBalanceBefore: { type: Number, required: true },
    availableBalanceAfter: { type: Number, required: true },
    payoutSnapshot: {
      bankName: String,
      accountNumber: String,
      accountHolder: String,
    },
  },
  { timestamps: true }
);

ledgerEntrySchema.plugin(tenantPlugin);
ledgerEntrySchema.index({ tenantId: 1, consultant: 1, createdAt: -1 });
ledgerEntrySchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function rejectMutation() {
  throw new Error('Ledger entries are append-only.');
});
ledgerEntrySchema.pre('save', function rejectResave() {
  if (!this.isNew) throw new Error('Ledger entries are append-only.');
});
ledgerEntrySchema.pre('validate', function validateEntryReferences() {
  if (this.type === 'commission_earned' && !this.lead) {
    this.invalidate('lead', 'Commission entries must reference a lead.');
  }
  if (this.type !== 'commission_earned' && !this.withdrawal) {
    this.invalidate('withdrawal', 'Withdrawal entries must reference a withdrawal.');
  }
});
ledgerEntrySchema.pre('deleteOne', { document: true, query: false }, function rejectDocumentDelete() {
  throw new Error('Ledger entries are append-only.');
});

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
