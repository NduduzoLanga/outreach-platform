const PaymentInvoice = require('../models/PaymentInvoice');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const { writeAuditLog } = require('./auditService');

const PAYMENT_LABELS = {
  commission_earned: 'Closed-won deal commission',
  referral_additional_incentive: 'Referral additional incentive',
  performance_based_incentive: 'Performance-based incentive',
  gratuity_incentive: 'Gratuity incentive',
  salary: 'Salary',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function currency(amount) {
  return `R${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function paymentLabel(paymentType) {
  return PAYMENT_LABELS[paymentType] || 'Platform payment';
}

function renderInvoiceHtml(invoice) {
  const row = (label, value) => `<tr><th style="padding:10px 12px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">${escapeHtml(label)}</th><td style="padding:10px 12px;text-align:right;color:#0f172a;border-bottom:1px solid #e2e8f0">${escapeHtml(value || '—')}</td></tr>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment invoice ${escapeHtml(invoice.invoiceNumber)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<main style="max-width:680px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:16px">
<header style="padding-bottom:22px;border-bottom:3px solid #087443"><p style="margin:0;color:#087443;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">Outreach Platform · Finance</p><h1 style="margin:10px 0 4px;font-size:28px">Payment invoice</h1><p style="margin:0;color:#64748b">${escapeHtml(invoice.invoiceNumber)}</p></header>
<p style="margin:24px 0 8px">Hello ${escapeHtml(invoice.recipientName)},</p><p style="margin:0 0 20px;color:#334155">A payment has been credited to your platform balance. This invoice records the credit; it is not a bank transfer confirmation.</p>
<div style="padding:20px;margin-bottom:20px;border-radius:12px;background:#ecfdf5"><p style="margin:0;color:#475569;font-size:13px">Payment credited</p><p style="margin:6px 0 0;color:#047857;font-size:32px;font-weight:bold">${escapeHtml(currency(invoice.amount))}</p></div>
<table style="width:100%;border-collapse:collapse">${row('Recipient', invoice.recipientName)}${row('Employee ID', invoice.employeeId)}${row('Account role', invoice.role)}${row('Payment type', paymentLabel(invoice.paymentType))}${row('Related deal', invoice.reference)}${row('Reason / description', invoice.description)}${row('Date credited', new Date(invoice.issuedAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }))}${row('Balance before credit', currency(invoice.availableBalanceBefore))}${row('Balance after credit', currency(invoice.availableBalanceAfter))}</table>
<p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.6">Keep this invoice for your records. You can also view and download it from the Invoices section of your Earnings workspace.</p>
</main></body></html>`;
}

function renderInvoiceText(invoice) {
  return [
    'OUTREACH PLATFORM - PAYMENT INVOICE',
    `Invoice number: ${invoice.invoiceNumber}`,
    `Recipient: ${invoice.recipientName}`,
    `Employee ID: ${invoice.employeeId || '—'}`,
    `Account role: ${invoice.role}`,
    `Payment type: ${paymentLabel(invoice.paymentType)}`,
    `Related deal: ${invoice.reference || '—'}`,
    `Reason / description: ${invoice.description || '—'}`,
    `Date credited: ${new Date(invoice.issuedAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}`,
    `Amount: ${currency(invoice.amount)}`,
    `Balance before credit: ${currency(invoice.availableBalanceBefore)}`,
    `Balance after credit: ${currency(invoice.availableBalanceAfter)}`,
    '',
    'This invoice records a credit to the platform balance; it is not a bank transfer confirmation.',
  ].join('\n');
}

function invoiceView(invoice) {
  return {
    _id: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    ledgerEntry: invoice.ledgerEntry,
    recipient: invoice.recipient,
    recipientSnapshot: invoice.recipientSnapshot,
    lead: invoice.lead,
    referenceSnapshot: invoice.referenceSnapshot,
    paymentType: invoice.paymentType,
    description: invoice.description,
    amount: invoice.amount,
    currency: invoice.currency,
    availableBalanceBefore: invoice.availableBalanceBefore,
    availableBalanceAfter: invoice.availableBalanceAfter,
    issuedAt: invoice.issuedAt,
    htmlContent: invoice.htmlContent,
    textContent: invoice.textContent,
  };
}

async function createPaymentInvoice({ req, session, entry, recipient, lead = null, paymentType, description = '' }) {
  const issuedAt = entry.createdAt || new Date();
  const invoiceNumber = `OP-${issuedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${String(entry._id).slice(-8).toUpperCase()}`;
  const details = {
    invoiceNumber,
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    employeeId: recipient.employeeId || '',
    role: recipient.role === 'specialist' ? 'Lead specialist' : 'Consultant',
    reference: lead ? (lead.centerName || lead.clientName || `Lead ${String(lead._id).slice(-8)}`) : '',
    paymentType,
    description: description.trim(),
    amount: entry.amount,
    availableBalanceBefore: entry.availableBalanceBefore,
    availableBalanceAfter: entry.availableBalanceAfter,
    issuedAt,
  };
  const [invoice] = await PaymentInvoice.create([{
    tenantId: req.tenantId,
    invoiceNumber,
    ledgerEntry: entry._id,
    recipient: recipient._id,
    recipientSnapshot: {
      name: recipient.name,
      email: recipient.email,
      employeeId: recipient.employeeId || '',
      role: recipient.role,
    },
    lead: lead?._id || null,
    referenceSnapshot: details.reference,
    paymentType,
    description: details.description,
    amount: entry.amount,
    currency: 'ZAR',
    availableBalanceBefore: entry.availableBalanceBefore,
    availableBalanceAfter: entry.availableBalanceAfter,
    issuedAt,
    htmlContent: renderInvoiceHtml(details),
    textContent: renderInvoiceText(details),
  }], { session });

  const [message] = await WorkspaceMessage.create([{
    tenantId: req.tenantId,
    type: 'payment_received',
    title: "You've received a payment",
    body: `Hello ${recipient.firstName || recipient.name}, ${currency(entry.amount)} has been credited to your platform balance as ${paymentLabel(paymentType)}. ${details.reference ? `Related deal: ${details.reference}. ` : ''}${description.trim() ? `Details: ${description.trim()} ` : ''}Balance after credit: ${currency(entry.availableBalanceAfter)}. Invoice ${invoiceNumber} is ready in your Earnings > Invoices section.`,
    lead: lead?._id || null,
    invoice: invoice._id,
    recipientIds: [recipient._id],
    audience: 'selected_users',
    createdBy: req.user._id,
  }], { session });

  await writeAuditLog({
    req,
    action: 'payment.invoice_issued',
    resourceType: 'PaymentInvoice',
    resourceId: invoice._id,
    after: {
      invoiceNumber,
      ledgerEntry: entry._id,
      recipient: recipient._id,
      amount: entry.amount,
      paymentType,
      notification: message._id,
    },
    session,
  });
  return { invoice, message };
}

module.exports = {
  createPaymentInvoice,
  invoiceView,
  paymentLabel,
  renderInvoiceHtml,
  renderInvoiceText,
};
