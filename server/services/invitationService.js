const { createHash, randomBytes } = require('node:crypto');
const nodemailer = require('nodemailer');

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const INVITATION_FROM = 'Azania Paragon Institute <hr@azania-paragon.institute>';

function createInvitationToken() {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
  };
}

function hashInvitationToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function getInvitationUrl(token) {
  const baseUrl = (process.env.CLIENT_APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function isEmailDeliveryConfigured() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  const port = Number(SMTP_PORT);
  return Boolean(
    SMTP_HOST
    && SMTP_PORT
    && Number.isInteger(port)
    && port >= 1
    && port <= 65535
    && Boolean(SMTP_USER) === Boolean(SMTP_PASSWORD)
  );
}

async function sendInvitationEmail({ name, email, role, invitationUrl, invitedBy }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT) {
    return { sent: false, reason: 'smtp_not_configured' };
  }
  if (Boolean(SMTP_USER) !== Boolean(SMTP_PASSWORD)) {
    return { sent: false, reason: 'smtp_auth_incomplete' };
  }
  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { sent: false, reason: 'smtp_port_invalid' };
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    ...(SMTP_USER ? { auth: { user: SMTP_USER, pass: SMTP_PASSWORD } } : {}),
  });
  const safeName = escapeHtml(name);
  const safeRole = escapeHtml(role);
  const safeInvitedBy = escapeHtml(invitedBy);
  const safeUrl = escapeHtml(invitationUrl);
  try {
    await transport.sendMail({
      from: INVITATION_FROM,
      to: email,
      subject: 'Your Outreach Platform account invitation',
      text: [
        `Hello ${name},`,
        `${invitedBy} invited you to join the Outreach Platform as a ${role}.`,
        'Use the secure link below within 24 hours to set your password and activate your account:',
        invitationUrl,
        'For your security, the invitation is single-use. We will never email you a password.',
      ].join('\n\n'),
      html: `<main style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#0f172a"><h1>Welcome to Outreach Platform</h1><p>Hello ${safeName},</p><p>${safeInvitedBy} invited you to join as a <strong>${safeRole}</strong>.</p><p>Use this secure, single-use link within 24 hours to create your password and activate your account.</p><p><a href="${safeUrl}" style="display:inline-block;background:#065f46;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Set your password</a></p><p>If you were not expecting this invitation, you can ignore this message. We will never email you a password.</p></main>`,
    });
  } finally {
    transport.close();
  }
  return { sent: true, reason: null };
}

module.exports = {
  createInvitationToken,
  getInvitationUrl,
  hashInvitationToken,
  INVITATION_FROM,
  isEmailDeliveryConfigured,
  sendInvitationEmail,
};
