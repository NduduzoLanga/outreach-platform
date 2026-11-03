const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');

const ledgerEntrySchema = new mongoose.Schema(
  {
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    withdrawal: { type: mongoose.Schema.Types.ObjectId, ref: 'Withdrawal', default: null },
    paymentInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentInvoice', default: null },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['withdrawal_reserved', 'withdrawal_approved', 'withdrawal_paid', 'withdrawal_refunded', 'commission_earned', 'income_assigned', 'income_paid'], required: true },
    incentiveType: {
      type: String,
      enum: ['referral_additional_incentive', 'performance_based_incentive', 'gratuity_incentive', 'salary'],
      default: undefined,
    },
    amount: { type: Number, required: true, min: 0.01 },
    availableBalanceBefore: { type: Number, required: true },
    availableBalanceAfter: { type: Number, required: true },
    assignmentReason: { type: String, default: '', trim: true, maxlength: 2000 },
    payoutSnapshot: {
      bankName: String,
      accountNumber: String,
      accountHolder: String,
      branchCode: String,
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
  if (this.type === 'income_assigned' && !this.incentiveType) {
    this.invalidate('incentiveType', 'Assigned income must have a payment type.');
  }
  if (this.type === 'income_paid' && !this.paymentInvoice) {
    this.invalidate('paymentInvoice', 'Income settlement entries must reference an invoice.');
  }
  if (!['commission_earned', 'income_assigned', 'income_paid'].includes(this.type) && !this.withdrawal) {
    this.invalidate('withdrawal', 'Withdrawal entries must reference a withdrawal.');
  }
});
ledgerEntrySchema.pre('deleteOne', { document: true, query: false }, function rejectDocumentDelete() {
  throw new Error('Ledger entries are append-only.');
});

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
