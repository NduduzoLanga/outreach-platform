const AuditLog = require('../models/AuditLog');

function requestMetadata(req) {
  return {
    ipAddress: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.get('user-agent') || '',
    requestId: req.id || req.headers['x-request-id'] || '',
  };
}

function sanitizeAuditValue(value, key = '') {
  if (/password|token|secret/i.test(key)) return '[REDACTED]';
  if (/accountnumber/i.test(key)) {
    const accountNumber = String(value || '');
    return accountNumber ? `••••${accountNumber.slice(-4)}` : '';
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item));
  if (
    value
    && typeof value === 'object'
    && !(value instanceof Date)
    && !value._bsontype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeAuditValue(childValue, childKey),
      ])
    );
  }
  return value;
}

async function writeAuditLog({ req, action, resourceType, resourceId, before = null, after = null, session }) {
  const metadata = requestMetadata(req);
  const [entry] = await AuditLog.create(
    [{
      actor: req.user._id,
      action,
      resourceType,
      resourceId,
      before: sanitizeAuditValue(before),
      after: sanitizeAuditValue(after),
      ...metadata,
    }],
    session ? { session } : {}
  );
  return entry;
}

module.exports = { writeAuditLog, sanitizeAuditValue };
