const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { connectMongo, disconnectMongo } = require('../config/mongoConnection');
const models = [
  require('../models/Agency'),
  require('../models/User'),
  require('../models/Lead'),
  require('../models/Withdrawal'),
  require('../models/Ticket'),
  require('../models/LedgerEntry'),
  require('../models/AuditLog'),
];

async function initializeMongoDB() {
  await connectMongo({ allowLocalDefault: false });
  console.log(`Connected to MongoDB at ${mongoose.connection.host}.`);

  for (const Model of models) {
    await Model.createIndexes();
    console.log(`Ensured schema indexes for ${Model.collection.collectionName}.`);
  }

  console.log('MongoDB collections and indexes initialized successfully.');
}

initializeMongoDB()
  .catch((error) => {
    console.error('MongoDB initialization failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await disconnectMongo();
    }
  });
