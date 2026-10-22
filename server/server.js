const express = require('express');
const mongoose = require('mongoose');
const path = require('node:path');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { randomUUID } = require('node:crypto');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { isEmailDeliveryConfigured } = require('./services/invitationService');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set('X-Request-Id', req.id);
  next();
});
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', (req, res, next) => {
  if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ message: 'Request body must be a JSON object.' });
  }
  return next();
});
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Try again later.' },
}));

// Register API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/leads', require('./routes/leadRoutes'));
app.use('/api/withdrawals', require('./routes/withdrawalRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/statements', require('./routes/statementRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  const statusCode = databaseConnected ? 200 : 503;
  res.status(statusCode).json({
    status: databaseConnected ? 'operational' : 'degraded',
    database: databaseConnected ? 'connected' : 'unavailable',
    emailNotificationsConfigured: isEmailDeliveryConfigured(),
  });
});
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  }
  await connectDB();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start API:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
