const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { authorize } = require('../middleware/roleMiddleware');
const { bindTenant, tenantContext } = require('../security/tenantContext');
const { sanitizeAuditValue } = require('../services/auditService');
const { isCentAmount, toCurrency, calculateCommission } = require('../services/money');
const { createGoogleMeetEvent, updateGoogleMeetEvent } = require('../services/googleCalendarService');
const { getDirectMongoUri, getMongoUri, isSrvDnsResolutionFailure } = require('../config/mongoUri');
const Lead = require('../models/Lead');
const LedgerEntry = require('../models/LedgerEntry');
const Ticket = require('../models/Ticket');

test('tenant middleware binds only the authenticated account tenant', async () => {
  await new Promise((resolve, reject) => {
    const expectedTenant = '65f000000000000000000001';
    const req = { user: { tenantId: expectedTenant } };
    const res = {};
    bindTenant(req, res, (error) => {
      try {
        assert.ifError(error);
        assert.equal(req.tenantId, expectedTenant);
        assert.equal(tenantContext.getStore(), expectedTenant);
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
});

test('tenant middleware rejects accounts without an agency assignment', () => {
  let statusCode;
  let responseBody;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  bindTenant({ user: {} }, res, () => assert.fail('next must not be called'));
  assert.equal(statusCode, 403);
  assert.match(responseBody.message, /agency/i);
});

test('role authorization denies unauthorized roles and permits authorized roles', () => {
  let statusCode;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json() {},
  };

  authorize('admin')({ user: { role: 'consultant' } }, res, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);

  authorize('admin')({ user: { role: 'admin' } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('audit sanitization masks account numbers and secrets recursively', () => {
  assert.deepEqual(
    sanitizeAuditValue({
      payoutSnapshot: { accountNumber: '1234567890' },
      password: 'not-for-audit',
      safe: { accountHolder: 'Example Person' },
    }),
    {
      payoutSnapshot: { accountNumber: '••••7890' },
      password: '[REDACTED]',
      safe: { accountHolder: 'Example Person' },
    }
  );
});

test('Google Calendar scheduling records local meetings without fabricating a Meet URL', async () => {
  const keys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);

  try {
    const result = await createGoogleMeetEvent({
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    assert.match(result.eventId, /^local_/);
    assert.equal(result.googleMeetLink, null);
    assert.equal(result.isLiveSynced, false);
    assert.equal(result.status, 'local_only');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('local appointment rescheduling and cancellation do not call Google Calendar', async () => {
  const keys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);

  try {
    assert.deepEqual(
      await updateGoogleMeetEvent({ eventId: 'local_appointment', status: 'rescheduled', scheduledAt: new Date(Date.now() + 60_000) }),
      { status: 'local_only' }
    );
    assert.deepEqual(
      await updateGoogleMeetEvent({ eventId: 'local_appointment', status: 'cancelled' }),
      { status: 'local_only' }
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('MongoDB connection fallback is limited to SRV DNS refusal errors', () => {
  assert.equal(isSrvDnsResolutionFailure(new Error('querySrv ECONNREFUSED _mongodb._tcp.example.test')), true);
  assert.equal(isSrvDnsResolutionFailure({ code: 'ECONNREFUSED', syscall: 'querySrv' }), true);
  assert.equal(isSrvDnsResolutionFailure({ code: 'ECONNREFUSED', syscall: 'connect' }), false);
  assert.equal(isSrvDnsResolutionFailure(new Error('Authentication failed')), false);
});

test('MongoDB URI configuration accepts SRV primaries and direct seed-list fallbacks', () => {
  const keys = ['MONGO_URI', 'MONGODB_URI', 'MONGODB_DIRECT_URI', 'MONGO_DIRECT_URI'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  process.env.MONGODB_URI = 'mongodb+srv://user:password@cluster.example.test/outreach?retryWrites=true';
  process.env.MONGODB_DIRECT_URI = 'mongodb://user:password@seed-00.example.test:27017,seed-01.example.test:27017/outreach?replicaSet=atlas-test';

  try {
    assert.equal(getMongoUri({ allowLocalDefault: false }), process.env.MONGODB_URI);
    assert.equal(getDirectMongoUri(), process.env.MONGODB_DIRECT_URI);
    process.env.MONGODB_DIRECT_URI = 'mongodb+srv://user:password@cluster.example.test/outreach';
    assert.throws(() => getDirectMongoUri(), /must use the mongodb:\/\/ protocol/i);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('lead business pipeline uses five ordered specialist stages', () => {
  const { PIPELINE_STAGES, getLegacyStageFromPipeline, getPipelineStageFromLegacy } = require('../services/leadPipeline');
  assert.deepEqual(PIPELINE_STAGES, [
    '1_new_unclaimed',
    '2_specialist_contacted',
    '3_demo_meeting_scheduled',
    '4_proposal_negotiation',
    '5_closed_won_pending_payout',
  ]);
  assert.equal(getPipelineStageFromLegacy('In Progress'), '3_demo_meeting_scheduled');
  assert.equal(getLegacyStageFromPipeline('5_closed_won_pending_payout'), 'Closed Won');
});

test('lead schema preserves intake compliance and appointment workflow fields', async () => {
  const id = new mongoose.Types.ObjectId();
  const lead = new Lead({
    tenantId: id,
    consultant: id,
    clientName: 'API ECD Centre',
    clientPhone: '+27123456789',
    centerName: 'API ECD Centre',
    address: '1 Example Street',
    townshipRegion: 'Vosloorus',
    registrationStatus: 'DBE Registered',
    principalName: 'Example Principal',
    primaryMobile: '+27123456789',
    currentAdminMethod: 'Paper',
    primaryPainPoint: 'Admin Chaos',
    ownerPersona: 'ambitious_innovator',
    qualificationTier: 'hot',
    initialEncounterNotes: 'Adult contact consented to specialist follow-up.',
    popiaConsentVerbalConfirmed: true,
    zeroChildrenDataCertified: true,
    appointments: [{
      specialist: id,
      title: 'Business in a Box demo',
      appointmentType: 'Product Demo',
      scheduledFor: new Date(Date.now() + 60_000),
    }],
  });

  await assert.doesNotReject(lead.validate());
  assert.equal(lead.pipelineStage, '1_new_unclaimed');
  assert.equal(lead.zeroChildrenDataCertified, true);
  lead.popiaConsentVerbalConfirmed = false;
  lead.appointments[0].appointmentType = 'Invalid';
  const validation = lead.validateSync();
  assert.ok(validation.errors['appointments.0.appointmentType']);

  const unverifiedLead = new Lead({
    tenantId: id,
    consultant: id,
    clientName: 'Unverified ECD Centre',
    clientPhone: '+27123456789',
  });
  assert.equal(unverifiedLead.popiaConsentVerbalConfirmed, false);
  assert.equal(unverifiedLead.zeroChildrenDataCertified, false);
});

test('money helpers accept cent precision and round currency values', () => {
  assert.equal(isCentAmount(25.25), true);
  assert.equal(isCentAmount(25.251), false);
  assert.equal(toCurrency(1.005), 1.01);
});

test('commission calculation uses the lead rate and rounds to cents', () => {
  assert.equal(calculateCommission(1000, 10), 100);
  assert.equal(calculateCommission(10.05, 10), 1.01);
  assert.equal(calculateCommission(1000, 0), 0);
  assert.throws(() => calculateCommission(100, 101), /between 0 and 100/i);
});

test('lead stage history requires an execution report', () => {
  const id = new mongoose.Types.ObjectId();
  const lead = new Lead({
    tenantId: id,
    consultant: id,
    clientName: 'Example Client',
    clientEmail: 'client@example.test',
    clientPhone: '+27123456789',
    stageHistory: [{
      fromStage: 'New',
      toStage: 'Contacted',
      completedBy: id,
      reportSummary: 'Too short',
    }],
  });

  assert.ok(lead.validateSync().errors['stageHistory.0.reportSummary']);
});

test('commission ledger entries reference a lead and allow no withdrawal reference', async () => {
  const id = new mongoose.Types.ObjectId();
  const entry = new LedgerEntry({
    tenantId: id,
    consultant: id,
    lead: id,
    actor: id,
    type: 'commission_earned',
    amount: 10,
    availableBalanceBefore: 0,
    availableBalanceAfter: 10,
  });

  await assert.doesNotReject(entry.validate());
  entry.lead = null;
  await assert.rejects(entry.validate(), /Commission entries must reference a lead/);
});

test('support sender roles include consultants, specialists, and admins', () => {
  const senderRole = Ticket.schema.path('messages').schema.path('senderRole');
  assert.deepEqual(senderRole.enumValues, ['consultant', 'specialist', 'admin']);
});
