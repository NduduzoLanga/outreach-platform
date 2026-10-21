const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, trim: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    requestId: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.plugin(tenantPlugin);
auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function rejectMutation() {
  throw new Error('Audit records are append-only.');
});
auditLogSchema.pre('save', function rejectResave() {
  if (!this.isNew) throw new Error('Audit records are append-only.');
});
auditLogSchema.pre('deleteOne', { document: true, query: false }, function rejectDocumentDelete() {
  throw new Error('Audit records are append-only.');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
