const Agency = require('../models/Agency');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Withdrawal = require('../models/Withdrawal');
const Ticket = require('../models/Ticket');
const { connectMongo } = require('./mongoConnection');

const connectDB = async () => {
  try {
    const conn = await connectMongo();
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await initializeDefaultAgency();
  } catch (error) {
    console.error('MongoDB bootstrap failed:', error);
    throw error;
  }
};

async function initializeDefaultAgency() {
  const agency = await Agency.findOneAndUpdate(
    { slug: 'default' },
    { $setOnInsert: { name: process.env.DEFAULT_AGENCY_NAME || 'Outreach Platform', slug: 'default' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  for (const Model of [User, Lead, Withdrawal, Ticket]) {
    await Model.updateMany(
      { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] },
      { $set: { tenantId: agency._id } }
    );
  }
}

module.exports = connectDB;
