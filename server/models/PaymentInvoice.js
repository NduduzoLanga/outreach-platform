const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');

const paymentInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, trim: true },
    ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientSnapshot: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      employeeId: { type: String, default: '' },
      role: { type: String, required: true },
    },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    referenceSnapshot: { type: String, default: '' },
    paymentType: {
      type: String,
      enum: [
        'commission_earned',
        'referral_additional_incentive',
        'performance_based_incentive',
        'gratuity_incentive',
        'salary',
      ],
      required: true,
    },
    description: { type: String, default: '', maxlength: 2000 },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'ZAR', enum: ['ZAR'] },
    availableBalanceBefore: { type: Number, required: true },
    availableBalanceAfter: { type: Number, required: true },
    issuedAt: { type: Date, required: true },
    htmlContent: { type: String, required: true },
    textContent: { type: String, required: true },
    settlementStatus: { type: String, enum: ['not_applicable', 'pending', 'partially_paid', 'paid'], default: 'not_applicable' },
    settlementPaidAmount: { type: Number, default: 0, min: 0 },
    settlementPaidAt: { type: Date, default: null },
    settlementBalanceBefore: { type: Number, default: null },
    settlementBalanceAfter: { type: Number, default: null },
    settlementEvents: [{
      amount: { type: Number, required: true, min: 0.01 },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      note: { type: String, default: '', maxlength: 2000 },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

paymentInvoiceSchema.plugin(tenantPlugin);
paymentInvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
paymentInvoiceSchema.index({ tenantId: 1, ledgerEntry: 1 }, { unique: true });
paymentInvoiceSchema.index({ tenantId: 1, recipient: 1, issuedAt: -1 });

module.exports = mongoose.model('PaymentInvoice', paymentInvoiceSchema);
