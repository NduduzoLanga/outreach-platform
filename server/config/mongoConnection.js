const mongoose = require('mongoose');
const dns = require('node:dns');
const { getMongoUri, getDirectMongoUri, isSrvDnsResolutionFailure } = require('./mongoUri');

const CONNECTION_OPTIONS = { serverSelectionTimeoutMS: 5000 };
let intentionalDisconnect = false;

function logMongoConnectionError(error) {
  console.error('MongoDB connection error event:', error);
  console.error('MongoDB error code:', error?.code ?? 'unavailable');
  if (error?.stack) console.error('MongoDB error stack:', error.stack);
}

function registerMongoConnectionEvents() {
  if (mongoose.connection.listenerCount('error') === 0) {
    mongoose.connection.on('error', logMongoConnectionError);
  }
  if (mongoose.connection.listenerCount('disconnected') === 0) {
    mongoose.connection.on('disconnected', () => {
      if (!intentionalDisconnect) {
        console.error('MongoDB disconnected event: the active connection was lost.');
      }
    });
  }
}

async function disconnectMongo() {
  intentionalDisconnect = true;
  try {
    await mongoose.disconnect();
  } finally {
    intentionalDisconnect = false;
  }
}

function configureMongoDns() {
  const configuredServers = (process.env.MONGODB_DNS_SERVERS || '')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
  if (!configuredServers.length) return;
  if (configuredServers.some((server) => !/^(?:\d{1,3}\.){3}\d{1,3}$|^[\da-f:]+$/i.test(server))) {
    throw new Error('MONGODB_DNS_SERVERS must be a comma-separated list of DNS server IP addresses.');
  }

  dns.setServers(configuredServers);
}

async function connectMongo({ allowLocalDefault = true } = {}) {
  registerMongoConnectionEvents();
  configureMongoDns();
  const uri = getMongoUri({ allowLocalDefault });

  try {
    return await mongoose.connect(uri, CONNECTION_OPTIONS);
  } catch (error) {
    const directUri = getDirectMongoUri();
    if (!directUri || !uri.startsWith('mongodb+srv://') || !isSrvDnsResolutionFailure(error)) {
      logMongoConnectionError(error);
      throw error;
    }

    console.warn('MongoDB SRV DNS resolution failed; retrying with MONGODB_DIRECT_URI.');
    if (mongoose.connection.readyState !== 0) {
      await disconnectMongo();
    }
    try {
      return await mongoose.connect(directUri, CONNECTION_OPTIONS);
    } catch (fallbackError) {
      logMongoConnectionError(fallbackError);
      throw fallbackError;
    }
  }
}

module.exports = { connectMongo, disconnectMongo, registerMongoConnectionEvents, configureMongoDns };
