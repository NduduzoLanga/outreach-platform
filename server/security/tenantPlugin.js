const { tenantContext } = require('./tenantContext');

const TENANT_QUERY_OPERATIONS = [
  'count',
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
];

function tenantPlugin(schema) {
  schema.add({
    tenantId: {
      type: schema.base.Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },
  });

  for (const operation of TENANT_QUERY_OPERATIONS) {
    schema.pre(operation, function scopeToTenant() {
      const tenantId = tenantContext.getStore();
      if (tenantId) {
        this.where({ tenantId });
      }
    });
  }

  schema.pre('estimatedDocumentCount', function rejectUnscopedCount() {
    if (tenantContext.getStore()) {
      throw new Error('Use countDocuments for tenant-scoped model counts.');
    }
  });

  schema.pre('insertMany', function scopeInsertMany(next, documents) {
    const tenantId = tenantContext.getStore();
    if (!tenantId) return next();

    for (const document of documents) {
      if (document.tenantId && String(document.tenantId) !== tenantId) {
        return next(new Error('Document tenant does not match the authenticated tenant.'));
      }
      document.tenantId = tenantId;
    }
    return next();
  });

  schema.pre('bulkWrite', function preventUnscopedBulkWrite(next) {
    if (tenantContext.getStore()) {
      return next(new Error('Bulk writes are disabled for tenant-scoped models.'));
    }
    return next();
  });

  schema.pre('aggregate', function scopeAggregation() {
    const tenantId = tenantContext.getStore();
    if (tenantId) {
      const unsafeStages = new Set([
        '$lookup',
        '$graphLookup',
        '$unionWith',
        '$out',
        '$merge',
        '$search',
        '$geoNear',
      ]);
      function containsUnsafeStage(stages) {
        return stages.some((stage) => (
          Object.keys(stage).some((key) => unsafeStages.has(key))
          || Object.values(stage).some((value) => (
            Array.isArray(value) && value.some((item) => item && typeof item === 'object' && containsUnsafeStage([item]))
          ))
        ));
      }
      if (containsUnsafeStage(this.pipeline())) {
        throw new Error('This aggregation contains stages that are not supported on tenant-scoped models.');
      }
      this.pipeline().unshift({ $match: { tenantId: new schema.base.Types.ObjectId(tenantId) } });
    }
  });

  schema.pre('save', function enforceDocumentTenant() {
    const tenantId = tenantContext.getStore();
    if (!tenantId) return;

    if (this.isNew && !this.tenantId) {
      this.tenantId = tenantId;
    }
    if (String(this.tenantId) !== tenantId) {
      throw new Error('Document tenant does not match the authenticated tenant.');
    }
  });

  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'], function bindUpdateTenant() {
    const tenantId = tenantContext.getStore();
    if (!tenantId) return;
    const update = this.getUpdate();
    if (Array.isArray(update)) {
      throw new Error('Pipeline updates are disabled for tenant-scoped models.');
    }
    if (this.op === 'replaceOne' || this.op === 'findOneAndReplace') {
      this.setUpdate({ ...update, tenantId });
      return;
    }
    this.setUpdate({
      ...update,
      $set: { ...(update?.$set || {}), tenantId },
    });
  });
}

module.exports = tenantPlugin;
