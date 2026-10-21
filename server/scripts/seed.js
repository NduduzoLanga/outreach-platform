const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Agency = require('../models/Agency');
const AuditLog = require('../models/AuditLog');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { tenantContext } = require('../security/tenantContext');
const { connectMongo, disconnectMongo } = require('../config/mongoConnection');

const demoLeads = [
  {
    clientName: 'Sipho Zulu',
    companyName: 'Apex Logistics SA',
    clientEmail: 'sipho@apexlogistics.example',
    clientPhone: '+27821234567',
    estimatedValue: 45000,
    conversionProbability: 20,
    stage: 'New',
    notes: 'Interested in enterprise logistics curriculum and training software.',
    specialist: false,
  },
  {
    clientName: 'Nandi Ndlovu',
    companyName: 'Vanguard Tech Partners',
    clientEmail: 'nandi@vanguardtech.example',
    clientPhone: '+27839876543',
    estimatedValue: 120000,
    conversionProbability: 60,
    stage: 'In Progress',
    notes: 'Specialist engaged in scope definition call.',
    specialist: true,
  },
  {
    clientName: 'David Miller',
    companyName: 'Horizon EduCorp',
    clientEmail: 'david@horizoneducorp.example',
    clientPhone: '+27845551234',
    estimatedValue: 85000,
    conversionProbability: 100,
    stage: 'Closed Won',
    notes: 'Contract signed and initial deposit received.',
    specialist: true,
  },
];

function requireSeedConfiguration() {
  if (process.env.SEED_DEMO_DATA !== 'true') {
    throw new Error('Set SEED_DEMO_DATA=true to explicitly enable demo data seeding.');
  }
  const accounts = [
    ['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD'],
    ['SEED_SPECIALIST_EMAIL', 'SEED_SPECIALIST_PASSWORD'],
    ['SEED_CONSULTANT_EMAIL', 'SEED_CONSULTANT_PASSWORD'],
  ];
  for (const [emailKey, passwordKey] of accounts) {
    if (!process.env[emailKey]?.trim() || !process.env[passwordKey]) {
      throw new Error(`${emailKey} and ${passwordKey} must be configured with unique seed credentials.`);
    }
    if (
      process.env[passwordKey].length < 12
      || Buffer.byteLength(process.env[passwordKey], 'utf8') > 72
    ) {
      throw new Error(`${passwordKey} must be at least 12 characters and no more than 72 UTF-8 bytes.`);
    }
  }

  const emails = accounts.map(([emailKey]) => process.env[emailKey].trim().toLowerCase());
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('Every seed account email must be a valid email address.');
  }
  if (new Set(emails).size !== emails.length) {
    throw new Error('Each seeded account must use a different email address.');
  }
  const passwords = accounts.map(([, passwordKey]) => process.env[passwordKey]);
  if (new Set(passwords).size !== passwords.length) {
    throw new Error('Use a different unique password for each seeded account.');
  }
  return emails;
}

async function ensureUser({
  email,
  name,
  password,
  role,
  phone,
  balance = 0,
  bankDetails,
  promoteExisting = false,
}, session) {
  let user = await User.findOne({ email }).session(session);
  if (user) {
    if (user.role !== role) {
      if (!promoteExisting || role !== 'admin') {
        const error = new Error(`Seed account ${email} exists with role '${user.role}', expected '${role}'.`);
        error.code = 'SEED_ROLE_MISMATCH';
        throw error;
      }
      const previousRole = user.role;
      user.role = role;
      await user.save({ session });
      if (previousRole === 'specialist') {
        const assignedLeads = await Lead.find({ assignedSpecialist: user._id }).session(session);
        for (const lead of assignedLeads) {
          lead.assignedSpecialist = null;
          lead.transferHistory.push({
            from: user._id,
            to: null,
            changedBy: user._id,
            reason: 'Seeded account promoted from specialist to admin.',
          });
          await lead.save({ session });
          await AuditLog.create([{
            actor: user._id,
            action: 'lead.specialist_released',
            resourceType: 'Lead',
            resourceId: lead._id,
            before: { assignedSpecialist: user._id },
            after: { assignedSpecialist: null, reason: 'Seeded account promoted from specialist to admin.' },
            requestId: 'seed-script',
          }], { session });
        }
      }
      await AuditLog.create([{
        actor: user._id,
        action: 'user.role_changed',
        resourceType: 'User',
        resourceId: user._id,
        before: { role: previousRole },
        after: { role },
        requestId: 'seed-script',
      }], { session });
      return { user, created: false, roleChanged: true };
    }
    return { user, created: false, roleChanged: false };
  }

  [user] = await User.create([{
    name,
    email,
    password,
    role,
    phone,
    balance,
    bankDetails,
  }], { session });
  return { user, created: true, roleChanged: false };
}

async function seedDemoData(admin, specialist, consultant, session) {
  const existingLeads = await Lead.find({
    clientEmail: { $in: demoLeads.map((lead) => lead.clientEmail) },
  }).select('clientEmail').session(session);
  const existingEmails = new Set(existingLeads.map((lead) => lead.clientEmail));
  const leadsToCreate = demoLeads.filter((lead) => !existingEmails.has(lead.clientEmail));

  if (leadsToCreate.length === 0) {
    return 0;
  }

  const createdLeads = await Lead.create(leadsToCreate.map((lead) => {
    const assignedSpecialist = lead.specialist ? specialist._id : null;
    return {
      consultant: consultant._id,
      assignedSpecialist,
      clientName: lead.clientName,
      companyName: lead.companyName,
      clientEmail: lead.clientEmail,
      clientPhone: lead.clientPhone,
      estimatedValue: lead.estimatedValue,
      conversionProbability: lead.conversionProbability,
      stage: lead.stage,
      notes: lead.notes,
      activityTimeline: [{
        actor: lead.specialist ? specialist._id : consultant._id,
        type: lead.specialist ? 'note' : 'lead_captured',
        text: lead.specialist ? lead.notes : 'Lead initially captured by consultant.',
      }],
      ...(assignedSpecialist ? {
        transferHistory: [{
          from: null,
          to: assignedSpecialist,
          changedBy: admin._id,
          reason: 'Initial demo-data assignment.',
        }],
      } : {}),
    };
  }), { session });

  for (const lead of createdLeads) {
    await AuditLog.create([{
      actor: admin._id,
      action: 'lead.demo_seeded',
      resourceType: 'Lead',
      resourceId: lead._id,
      after: {
        consultant: consultant._id,
        assignedSpecialist: lead.assignedSpecialist,
        stage: lead.stage,
        clientName: lead.clientName,
      },
    }], { session });
  }
  return createdLeads.length;
}

async function seedDatabase() {
  const [adminEmail, specialistEmail, consultantEmail] = requireSeedConfiguration();
  await connectMongo({ allowLocalDefault: false });
  console.log('Connected to MongoDB for seeding.');

  let agency = await Agency.findOne({ slug: 'default' });
  if (!agency) {
    agency = await Agency.create({
      name: process.env.DEFAULT_AGENCY_NAME || 'Outreach Platform',
      slug: 'default',
    });
  }
  if (!agency.active) {
    throw new Error('The default agency is inactive; refusing to seed accounts or demo data.');
  }

  const seedResult = await tenantContext.run(String(agency._id), async () => {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const { user: admin, created: adminCreated, roleChanged: adminRoleChanged } = await ensureUser({
          email: adminEmail,
          name: 'System Master Admin',
          password: process.env.SEED_ADMIN_PASSWORD,
          role: 'admin',
          phone: '+27110000000',
          promoteExisting: true,
        }, session);
        const { user: specialist, created: specialistCreated } = await ensureUser({
          email: specialistEmail,
          name: 'Lead Specialist (Demo)',
          password: process.env.SEED_SPECIALIST_PASSWORD,
          role: 'specialist',
          phone: '+27110000001',
        }, session);
        const { user: consultant, created: consultantCreated } = await ensureUser({
          email: consultantEmail,
          name: 'Outreach Consultant (Demo)',
          password: process.env.SEED_CONSULTANT_PASSWORD,
          role: 'consultant',
          phone: '+27110000002',
          balance: 15000,
          bankDetails: {
            bankName: 'Demo Bank',
            accountNumber: '00000000000',
            accountHolder: 'Demo Consultant',
            branchCode: '000000',
          },
        }, session);

        if (adminCreated) {
          await AuditLog.create([{
            actor: admin._id,
            action: 'user.demo_admin_seeded',
            resourceType: 'User',
            resourceId: admin._id,
            after: { role: 'admin', email: admin.email },
          }], { session });
        }
        const createdLeadCount = await seedDemoData(admin, specialist, consultant, session);
        result = {
          adminEmail: admin.email,
          adminCreated,
          adminRoleChanged,
          specialistEmail: specialist.email,
          specialistCreated,
          consultantEmail: consultant.email,
          consultantCreated,
          createdLeadCount,
        };
      });
      return result;
    } finally {
      await session.endSession();
    }
  });

  for (const [role, email, created, roleChanged] of [
    ['admin', seedResult.adminEmail, seedResult.adminCreated, seedResult.adminRoleChanged],
    ['specialist', seedResult.specialistEmail, seedResult.specialistCreated, false],
    ['consultant', seedResult.consultantEmail, seedResult.consultantCreated, false],
  ]) {
    const state = created ? 'Created' : roleChanged ? 'Promoted existing' : 'Verified existing';
    console.log(`${state} ${role} account: ${email}`);
  }
  console.log(seedResult.createdLeadCount
    ? `Created ${seedResult.createdLeadCount} sample leads.`
    : 'Verified sample leads already exist; no duplicate leads created.');
  console.log('Database seeding complete.');
}

seedDatabase()
  .catch((error) => {
    console.error('Database seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectMongo();
    }
  });
