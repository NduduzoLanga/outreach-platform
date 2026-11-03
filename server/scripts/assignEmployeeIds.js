const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { tenantContext } = require('../security/tenantContext');
const { connectMongo, disconnectMongo } = require('../config/mongoConnection');

const assignments = [
  { name: 'Manini S. Mokoena', employeeId: '#EMP-VOS-012' },
  { name: 'Malefu C. Radebe', employeeId: '#EMP-VOS-011' },
  { name: 'Dolphinah Langa', employeeId: '#EMP-VOS-010' },
  { name: 'Thabang Ntilane', employeeId: '#EMP-VOS-014' },
  { name: 'Thando N. Langa', employeeId: '#EMP-AAA-001' },
  { name: 'Lineo A. Motaung', employeeId: '#EMP-AAA-002' },
];

function nameParts(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchesName(user, requestedName) {
  const requested = nameParts(requestedName);
  const storedNames = [user.name, `${user.firstName || ''} ${user.lastName || ''}`]
    .map(nameParts);
  return storedNames.some((stored) => {
    if (stored[0] !== requested[0] || stored[stored.length - 1] !== requested[requested.length - 1]) return false;
    const requestedMiddle = requested.slice(1, -1);
    const storedMiddle = stored.slice(1, -1);
    return requestedMiddle.length === 0 || storedMiddle.length === 0 || (
      requestedMiddle.length >= storedMiddle.length
      && storedMiddle.every((part, index) => part[0] === requestedMiddle[index]?.[0])
    );
  });
}

async function assignEmployeeIds() {
  await connectMongo({ allowLocalDefault: false });
  const users = await User.find({}).select('name firstName lastName email employeeId role tenantId');
  const updates = assignments.map((assignment) => {
    const matches = users.filter((user) => matchesName(user, assignment.name));
    if (matches.length !== 1) {
      throw new Error(`${assignment.name}: expected one existing account, found ${matches.length}. No changes were made.`);
    }
    const user = matches[0];
    if (!['consultant', 'specialist'].includes(user.role) || !user.tenantId) {
      throw new Error(`${assignment.name}: account must be a tenant-assigned consultant or lead specialist. No changes were made.`);
    }
    if (user.employeeId && user.employeeId !== assignment.employeeId) {
      throw new Error(`${assignment.name}: already has a different employment ID (${user.employeeId}). No changes were made.`);
    }
    return { ...assignment, user };
  });

  const targetIds = new Set(updates.map(({ employeeId }) => employeeId));
  if (targetIds.size !== assignments.length) {
    throw new Error('The requested employment IDs are not unique. No changes were made.');
  }
  for (const { employeeId, user } of updates) {
    const collision = users.find((candidate) => (
      String(candidate.tenantId) === String(user.tenantId)
      && candidate.employeeId === employeeId
      && String(candidate._id) !== String(user._id)
    ));
    if (collision) {
      throw new Error(`${employeeId} is already assigned to another account in the same tenant. No changes were made.`);
    }
  }

  console.log('Validated employee ID assignments:');
  for (const { name, employeeId, user } of updates) {
    console.log(`- ${name} (${user.email || user._id}): ${employeeId}${user.employeeId ? ' (already assigned)' : ''}`);
  }
  if (!process.argv.includes('--apply')) {
    console.log('Dry run only. Re-run with -- --apply to persist these assignments.');
    return;
  }

  const updatesByTenant = new Map();
  for (const update of updates) {
    const tenantId = String(update.user.tenantId);
    if (!updatesByTenant.has(tenantId)) updatesByTenant.set(tenantId, []);
    updatesByTenant.get(tenantId).push(update);
  }

  for (const [tenantId, tenantUpdates] of updatesByTenant) {
    await tenantContext.run(tenantId, async () => {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const actor = await User.findOne({
            role: 'admin',
            $or: [{ accountStatus: 'active' }, { accountStatus: { $exists: false } }],
          }).select('_id').session(session);
          if (!actor) throw new Error('No active administrator exists in this tenant to audit the employee ID updates.');
          for (const { name, employeeId, user } of tenantUpdates) {
            const current = await User.findById(user._id).session(session);
            if (!current) throw new Error(`${name}: account disappeared during update.`);
            if (current.employeeId && current.employeeId !== employeeId) {
              throw new Error(`${name}: employment ID changed after validation; transaction cancelled.`);
            }
            if (current.employeeId === employeeId) continue;
            current.employeeId = employeeId;
            await current.save({ session });
            await AuditLog.create([{
              tenantId: current.tenantId,
              actor: actor._id,
              action: 'user.employee_id_assigned',
              resourceType: 'User',
              resourceId: current._id,
              before: { employeeId: null },
              after: { employeeId },
              requestId: 'employee-id-assignment-script',
            }], { session });
          }
        });
      } finally {
        await session.endSession();
      }
    });
  }
  console.log('Employee IDs assigned successfully.');
}

assignEmployeeIds()
  .catch((error) => {
    console.error('Failed to assign employee IDs:', error.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectMongo());
