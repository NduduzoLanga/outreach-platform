const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { writeAuditLog } = require('../services/auditService');

test('audit log records use the authenticated user tenant explicitly', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const requestActorId = new mongoose.Types.ObjectId();
  const originalCreate = AuditLog.create;
  let createdDocuments;

  AuditLog.create = async (documents) => {
    createdDocuments = documents;
    return documents;
  };

  try {
    await writeAuditLog({
      req: { user: { _id: requestActorId }, get: () => '', headers: {} },
      actor: { _id: actorId, tenantId },
      action: 'user.invitation_created',
      resourceType: 'User',
      resourceId: new mongoose.Types.ObjectId(),
    });

    assert.equal(String(createdDocuments[0].tenantId), String(tenantId));
    assert.equal(String(createdDocuments[0].actor), String(actorId));
  } finally {
    AuditLog.create = originalCreate;
  }
});

test('audit log writes fail clearly when no tenant can be resolved', async () => {
  await assert.rejects(
    writeAuditLog({
      req: { user: { _id: new mongoose.Types.ObjectId() } },
      action: 'user.invitation_created',
      resourceType: 'User',
      resourceId: new mongoose.Types.ObjectId(),
    }),
    { message: 'Cannot write an audit log without an authenticated tenant.' }
  );
});
