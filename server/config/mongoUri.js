const { ConnectionString } = require('mongodb-connection-string-url');

function parseMongoUri(uri, name) {
  try {
    return new ConnectionString(uri);
  } catch {
    throw new Error(`${name} is not a valid MongoDB connection string.`);
  }
}

function getMongoUri({ allowLocalDefault = true } = {}) {
  const configuredUris = [process.env.MONGO_URI, process.env.MONGODB_URI]
    .filter((uri) => typeof uri === 'string' && uri.trim())
    .map((uri) => uri.trim());

  if (new Set(configuredUris).size > 1) {
    throw new Error('MONGO_URI and MONGODB_URI are both set to different values. Configure only one MongoDB URI.');
  }
  if (configuredUris.length) {
    const uri = configuredUris[0];
    parseMongoUri(uri, 'MONGO_URI or MONGODB_URI');
    return uri;
  }
  if (allowLocalDefault && process.env.NODE_ENV !== 'production') {
    return 'mongodb://127.0.0.1:27017/outreach_platform?replicaSet=rs0';
  }
  throw new Error('MONGO_URI or MONGODB_URI must be configured.');
}

function getDirectMongoUri() {
  const uri = (process.env.MONGODB_DIRECT_URI || process.env.MONGO_DIRECT_URI || '').trim();
  if (!uri) return null;

  const parsed = parseMongoUri(uri, 'MONGODB_DIRECT_URI');
  if (parsed.protocol !== 'mongodb:') {
    throw new Error('MONGODB_DIRECT_URI must use the mongodb:// protocol.');
  }
  return uri;
}

function isSrvDnsResolutionFailure(error) {
  const pending = [error];
  const visited = new Set();

  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    const message = `${current.message || ''} ${current.syscall || ''}`;
    if (
      (current.code === 'ECONNREFUSED' && /querySrv/i.test(message))
      || /querySrv ECONNREFUSED/i.test(message)
    ) {
      return true;
    }
    if (current.cause) pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors);
  }

  return false;
}

module.exports = { getMongoUri, getDirectMongoUri, isSrvDnsResolutionFailure };
