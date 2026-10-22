const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Agency = require('../models/Agency');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { tenantContext } = require('../security/tenantContext');
const { runInTransaction } = require('../services/transactionService');
const connectDB = require('../config/db');
const { disconnectMongo } = require('../config/mongoConnection');

async function bootstrapAdmin() {
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!name || name.length > 120 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set a valid BOOTSTRAP_ADMIN_NAME and BOOTSTRAP_ADMIN_EMAIL for this one-time operation.');
  }
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes.');
  }

  await connectDB();
  const agency = await Agency.findOne({ slug: 'default' });
  if (!agency) throw new Error('The default agency was not initialized.');

  await tenantContext.run(String(agency._id), async () => {
    if (await User.exists({ role: 'admin' })) {
      throw new Error('An administrator already exists. Use the Admin Control Panel to manage accounts.');
    }
    if (await User.exists({ email })) {
      throw new Error('An account already exists for this email address.');
    }

    await runInTransaction(async (session) => {
      const [user] = await User.create([{
        tenantId: agency._id,
        name,
        email,
        password,
        role: 'admin',
        accountStatus: 'active',
        passwordChangedAt: new Date(),
      }], { session });
      await AuditLog.create([{
        tenantId: agency._id,
        actor: user._id,
        action: 'user.initial_admin_bootstrapped',
        resourceType: 'User',
        resourceId: user._id,
        after: { role: 'admin', accountStatus: 'active' },
        requestId: 'bootstrap-admin-script',
      }], { session });
    });
  });

  console.log(`Initial administrator provisioned for ${email}. Remove BOOTSTRAP_ADMIN_* values from the environment now.`);
}

bootstrapAdmin()
  .catch((error) => {
    console.error('Administrator bootstrap failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await disconnectMongo();
  });
