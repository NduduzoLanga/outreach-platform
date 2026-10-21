const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { tenantContext } = require('../security/tenantContext');
const { connectMongo, disconnectMongo } = require('../config/mongoConnection');

async function promoteAdmin() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error('Provide the existing account email: npm run promote-admin -- user@example.com');
  }
  await connectMongo({ allowLocalDefault: false });
  const user = await User.findOne({ email }).select('name email role tenantId');
  if (!user) {
    throw new Error(`No account found for ${email}. Register that account before promoting it.`);
  }
  if (!user.tenantId) {
    throw new Error('The account has no agency assignment. Start the API once to run tenant migration before promoting it.');
  }

  await tenantContext.run(String(user.tenantId), async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const currentUser = await User.findById(user._id).session(session);
        if (!currentUser) throw new Error('The account no longer exists.');
        const previousRole = currentUser.role;
        currentUser.role = 'admin';
        await currentUser.save({ session });
        if (previousRole !== 'admin') {
          await AuditLog.create([{
            tenantId: user.tenantId,
            actor: user._id,
            action: 'user.role_changed',
            resourceType: 'User',
            resourceId: user._id,
            before: { role: previousRole },
            after: { role: 'admin' },
            requestId: 'admin-promotion-script',
          }], { session });
        }
      });
    } finally {
      await session.endSession();
    }
  });
  console.log(`Promoted ${user.email} to admin.`);
}

promoteAdmin()
  .catch((error) => {
    console.error('Failed to promote administrator:', error.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectMongo());
