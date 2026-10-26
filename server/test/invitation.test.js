const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const {
  createInvitationToken,
  getInvitationUrl,
  hashInvitationToken,
  INVITATION_FROM,
  isEmailDeliveryConfigured,
  sendInvitationEmail,
} = require('../services/invitationService');
const { combineName, splitFullName } = require('../services/userName');

test('user full name is kept in sync with first and last names', async () => {
  const user = new User({
    tenantId: new mongoose.Types.ObjectId(),
    firstName: 'Amahle',
    lastName: 'Ndlovu',
    email: 'amahle@example.test',
    password: 'a-long-test-password',
  });
  await user.validate();

  assert.equal(user.name, 'Amahle Ndlovu');
  assert.deepEqual(splitFullName(user.name), { firstName: 'Amahle', lastName: 'Ndlovu' });
  assert.equal(combineName(user.firstName, user.lastName), 'Amahle Ndlovu');
});

test('legacy full names are split for existing accounts', async () => {
  const user = new User({
    tenantId: new mongoose.Types.ObjectId(),
    name: 'Lerato Mokoena',
    email: 'lerato@example.test',
    password: 'a-long-test-password',
  });
  await user.validate();

  assert.equal(user.firstName, 'Lerato');
  assert.equal(user.lastName, 'Mokoena');
});

test('invitation tokens are random, hashed for storage, and expire within 24 hours', () => {
  const first = createInvitationToken();
  const second = createInvitationToken();

  assert.equal(first.token.length, 43);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashInvitationToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
  assert.ok(first.expiresAt.getTime() > Date.now());
  assert.ok(first.expiresAt.getTime() <= Date.now() + 24 * 60 * 60 * 1000);
});

test('invitation URL uses the configured frontend origin and URL-encodes the token', () => {
  const originalUrl = process.env.CLIENT_APP_URL;
  process.env.CLIENT_APP_URL = 'https://portal.example.test/';

  try {
    assert.equal(
      getInvitationUrl('token/with+reserved=chars'),
      'https://portal.example.test/accept-invite?token=token%2Fwith%2Breserved%3Dchars'
    );
  } finally {
    if (originalUrl === undefined) delete process.env.CLIENT_APP_URL;
    else process.env.CLIENT_APP_URL = originalUrl;
  }
});

test('invitation email service explicitly reports unconfigured SMTP without sending', async () => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);

  try {
    assert.deepEqual(
      await sendInvitationEmail({
        name: 'Test User',
        email: 'test@example.test',
        role: 'consultant',
        invitationUrl: 'https://portal.example.test/accept-invite?token=token',
        invitedBy: 'Administrator',
      }),
      { sent: false, reason: 'smtp_not_configured' }
    );
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

test('email readiness requires valid SMTP settings and a complete optional auth pair', () => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
  });
  delete process.env.SMTP_PASSWORD;

  try {
    assert.equal(isEmailDeliveryConfigured(), false);
    process.env.SMTP_PASSWORD = 'secret';
    assert.equal(isEmailDeliveryConfigured(), true);
    assert.equal(INVITATION_FROM, 'Azania Paragon Institute <hr@azania-paragon.institute>');
    process.env.SMTP_PORT = 'invalid';
    assert.equal(isEmailDeliveryConfigured(), false);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

test('invitation SMTP sends use bounded connection and socket timeouts', async () => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'mailer@example.test',
    SMTP_PASSWORD: 'test-only-password',
  });
  const originalCreateTransport = nodemailer.createTransport;
  let transportOptions;
  let closed = false;
  nodemailer.createTransport = (options) => {
    transportOptions = options;
    return {
      sendMail: async () => ({ messageId: 'test-message' }),
      close: () => { closed = true; },
    };
  };

  try {
    const result = await sendInvitationEmail({
      name: 'Test User',
      email: 'test@example.test',
      role: 'consultant',
      invitationUrl: 'https://portal.example.test/accept-invite?token=test-token',
      invitedBy: 'Administrator',
    });

    assert.deepEqual(result, { sent: true, reason: null });
    assert.equal(transportOptions.connectionTimeout, 10_000);
    assert.equal(transportOptions.greetingTimeout, 10_000);
    assert.equal(transportOptions.socketTimeout, 20_000);
    assert.equal(closed, true);
  } finally {
    nodemailer.createTransport = originalCreateTransport;
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
