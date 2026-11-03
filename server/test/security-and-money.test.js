const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { authorize } = require('../middleware/roleMiddleware');
const { applyLeadRLS } = require('../middleware/roleMiddleware');
const { bindTenant, tenantContext } = require('../security/tenantContext');
const { sanitizeAuditValue } = require('../services/auditService');
const { isCentAmount, toCurrency, calculateCommission } = require('../services/money');
const { calculatePackageCommission } = require('../services/commissionPackages');
const { createGoogleMeetEvent, updateGoogleMeetEvent } = require('../services/googleCalendarService');
const { getDirectMongoUri, getMongoUri, isSrvDnsResolutionFailure } = require('../config/mongoUri');
const Lead = require('../models/Lead');
const LedgerEntry = require('../models/LedgerEntry');
const PaymentInvoice = require('../models/PaymentInvoice');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const { renderInvoiceHtml, renderInvoiceText } = require('../services/paymentInvoiceService');

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

test('specialist lead filters include assigned leads and the available queue', () => {
  const specialistId = new mongoose.Types.ObjectId();
  const filter = applyLeadRLS({ user: { role: 'specialist', _id: specialistId } });
  assert.deepEqual(filter.$and[2].$or, [
    { assignedSpecialist: specialistId },
    { assignedSpecialist: null },
  ]);
});

test('workspace messages validate broadcast announcements and targeted assignment notices', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const announcement = new WorkspaceMessage({
    tenantId,
    type: 'announcement',
    title: 'Updated payout schedule',
    body: 'Please review the new finance processing timeline.',
    audience: 'all_accounts',
    createdBy: userId,
  });
  await assert.doesNotReject(announcement.validate());

  const assignmentNotice = new WorkspaceMessage({
    tenantId,
    type: 'lead_assignment',
    title: 'A lead has been assigned to you',
    body: 'This lead is now assigned to you.',
    lead: new mongoose.Types.ObjectId(),
    recipientIds: [userId],
    audience: 'selected_users',
    createdBy: userId,
  });
  await assert.doesNotReject(assignmentNotice.validate());

  const paymentNotice = new WorkspaceMessage({
    tenantId,
    type: 'payment_received',
    title: "You've received a payment",
    body: 'A new payment credit and invoice are available.',
    invoice: new mongoose.Types.ObjectId(),
    recipientIds: [userId],
    audience: 'selected_users',
    createdBy: userId,
  });
  await assert.doesNotReject(paymentNotice.validate());
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
    dealPackage: 'institutional_flagship',
    customCommissionAmount: 2400,
  });

  await assert.doesNotReject(lead.validate());
  assert.equal(lead.pipelineStage, '1_new_unclaimed');
  assert.equal(lead.zeroChildrenDataCertified, true);
  assert.equal(lead.dealPackage, 'institutional_flagship');
  assert.equal(lead.customCommissionAmount, 2400);
  lead.popiaConsentVerbalConfirmed = false;
  lead.appointments[0].appointmentType = 'Invalid';
  const validation = lead.validateSync();
  assert.ok(validation.errors['appointments.0.appointmentType']);
  lead.appointments[0].appointmentType = 'Product Demo';
  lead.customCommissionAmount = 3200;
  assert.ok(lead.validateSync().errors.customCommissionAmount);

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

test('fixed deal packages award the published once-off consultant commissions', () => {
  assert.equal(calculatePackageCommission('essential_starter').amount, 500);
  assert.equal(calculatePackageCommission('growth_professional').amount, 750);
  assert.equal(calculatePackageCommission('complete_academy').amount, 1000);
  assert.equal(calculatePackageCommission('institutional_flagship', 1500).amount, 1500);
  assert.equal(calculatePackageCommission('institutional_flagship', 3000).amount, 3000);
  assert.throws(() => calculatePackageCommission('institutional_flagship', 1499), /between R1500 and R3000/i);
  assert.throws(() => calculatePackageCommission('unknown'), /valid closed-deal package/i);
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

test('commission ledger entries require a lead while assigned payment types can stand alone', async () => {
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
  entry.type = 'income_assigned';
  entry.assignmentReason = 'Recognize specialist contribution on the closed deal.';
  entry.incentiveType = 'referral_additional_incentive';
  await assert.doesNotReject(entry.validate());
  entry.lead = null;
  entry.incentiveType = 'salary';
  await assert.doesNotReject(entry.validate());
  entry.incentiveType = undefined;
  await assert.rejects(entry.validate(), /Assigned income must have a payment type/);
  entry.type = 'commission_earned';
  await assert.rejects(entry.validate(), /Commission entries must reference a lead/);
});

test('employee IDs use the platform employment ID format', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const user = new User({
    tenantId,
    name: 'Employee Example',
    email: 'employee@example.test',
    password: 'valid_password_123',
    employeeId: '#EMP-VOS-012',
  });
  assert.equal(user.validateSync(), undefined);
  user.employeeId = 'EMP-VOS-012';
  assert.ok(user.validateSync().errors.employeeId);
});

test('payment invoice records validate and render safe HTML and text formats', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const ledgerId = new mongoose.Types.ObjectId();
  const invoice = new PaymentInvoice({
    tenantId,
    invoiceNumber: 'OP-20261103-1234ABCD',
    ledgerEntry: ledgerId,
    recipient: userId,
    recipientSnapshot: {
      name: 'Invoice <script>alert(1)</script>',
      email: 'invoice@example.test',
      employeeId: '#EMP-VOS-012',
      role: 'consultant',
    },
    paymentType: 'performance_based_incentive',
    amount: 100,
    availableBalanceBefore: 50,
    availableBalanceAfter: 150,
    issuedAt: new Date('2026-11-03T10:00:00.000Z'),
    htmlContent: '<html></html>',
    textContent: 'Invoice',
  });
  assert.equal(invoice.validateSync(), undefined);
  const details = {
    invoiceNumber: invoice.invoiceNumber,
    recipientName: invoice.recipientSnapshot.name,
    employeeId: invoice.recipientSnapshot.employeeId,
    role: 'Consultant',
    reference: '<unsafe deal>',
    paymentType: invoice.paymentType,
    description: 'Performance achievement',
    amount: 100,
    availableBalanceBefore: 50,
    availableBalanceAfter: 150,
    issuedAt: invoice.issuedAt,
  };
  const html = renderInvoiceHtml(details);
  assert.match(html, /invoice OP-20261103-1234ABCD/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(renderInvoiceText(details), /Amount: R100,00/);
  assert.match(renderInvoiceText(details), /Payment type: Performance-based incentive/);
});

test('user profile accepts a secure Calendly scheduling link', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const user = new User({
    tenantId,
    name: 'Conference Specialist',
    email: 'specialist@example.test',
    password: 'valid_password_123',
    calendlyUrl: 'https://calendly.com/conference-specialist',
  });
  assert.equal(user.validateSync(), undefined);
  user.calendlyUrl = 'http://calendly.com/conference-specialist';
  assert.ok(user.validateSync().errors.calendlyUrl);
});

test('support sender roles include consultants, specialists, and admins', () => {
  const senderRole = Ticket.schema.path('messages').schema.path('senderRole');
  assert.deepEqual(senderRole.enumValues, ['consultant', 'specialist', 'admin']);
});
