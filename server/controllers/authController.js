const User = require('../models/User');
const Agency = require('../models/Agency');
const jwt = require('jsonwebtoken');
const { runInTransaction } = require('../services/transactionService');
const { writeAuditLog } = require('../services/auditService');
const { respondWithControllerError } = require('../middleware/controllerError');

const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register new Outreach Consultant
// @route   POST /api/auth/register
const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (
      typeof name !== 'string'
      || !name.trim()
      || typeof email !== 'string'
      || !email.trim()
    ) {
      return res.status(400).json({ message: 'Please enter all required fields' });
    }
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const agency = await Agency.findOne({ slug: 'default', active: true });
    if (!agency) {
      return res.status(503).json({ message: 'The platform agency is not initialized.' });
    }

    const user = await User.create({
      tenantId: agency._id,
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: typeof phone === 'string' ? phone.trim() : '',
    });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : error.name === 'ValidationError' ? 400 : 500)
      .json({ message: error.code === 11000 ? 'User with this email already exists.' : error.name === 'ValidationError' ? error.message : 'Could not register account.' });
  }
};

// @desc    Authenticate User & Get Token
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: user.balance,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

// @desc    Get Current Logged in User Profile
// @route   GET /api/auth/profile
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

// @desc    Update User Banking / Profile Info
// @route   PUT /api/auth/profile
const updateUserProfile = async (req, res) => {
  try {
    const updatedUser = await runInTransaction(async (session) => {
      const currentUser = await User.findById(req.user._id).session(session);
      if (!currentUser) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }
      const priorBankDetails = currentUser.bankDetails.toObject
        ? currentUser.bankDetails.toObject()
        : { ...currentUser.bankDetails };
      const previous = {
        name: currentUser.name,
        phone: currentUser.phone,
        bankDetails: {
          accountHolder: priorBankDetails.accountHolder,
          bankName: priorBankDetails.bankName,
          accountNumberLast4: priorBankDetails.accountNumber?.slice(-4) || '',
          branchCode: priorBankDetails.branchCode,
        },
      };

      if (req.body.name !== undefined) {
        if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.length > 120) {
          const error = new Error('Name must be between 1 and 120 characters.');
          error.statusCode = 400;
          throw error;
        }
        currentUser.name = req.body.name.trim();
      }
      if (req.body.phone !== undefined) {
        if (typeof req.body.phone !== 'string' || req.body.phone.length > 32) {
          const error = new Error('Phone number must be 32 characters or fewer.');
          error.statusCode = 400;
          throw error;
        }
        currentUser.phone = req.body.phone.trim();
      }
      if (req.body.bankDetails !== undefined) {
        if (!req.body.bankDetails || typeof req.body.bankDetails !== 'object' || Array.isArray(req.body.bankDetails)) {
          const error = new Error('Bank details must be provided as an object.');
          error.statusCode = 400;
          throw error;
        }
        const bankFieldLimits = { accountHolder: 120, bankName: 120, accountNumber: 40, branchCode: 20 };
        for (const [field, maxLength] of Object.entries(bankFieldLimits)) {
          const value = req.body.bankDetails[field];
          if (value !== undefined && (typeof value !== 'string' || value.length > maxLength)) {
            const error = new Error(`Bank detail '${field}' must be a string of at most ${maxLength} characters.`);
            error.statusCode = 400;
            throw error;
          }
        }
        currentUser.bankDetails = {
          accountHolder: req.body.bankDetails.accountHolder ?? currentUser.bankDetails.accountHolder,
          bankName: req.body.bankDetails.bankName ?? currentUser.bankDetails.bankName,
          accountNumber: req.body.bankDetails.accountNumber ?? currentUser.bankDetails.accountNumber,
          branchCode: req.body.bankDetails.branchCode ?? currentUser.bankDetails.branchCode,
        };
      }
      if (req.body.password) {
        if (
          typeof req.body.password !== 'string'
          || req.body.password.length < 8
          || Buffer.byteLength(req.body.password, 'utf8') > 72
        ) {
          const error = new Error('Password must be at least 8 characters and no more than 72 UTF-8 bytes.');
          error.statusCode = 400;
          throw error;
        }
        currentUser.password = req.body.password;
      }

      await currentUser.save({ session });
      if (req.body.bankDetails) {
        await writeAuditLog({
          req,
          action: 'user.bank_details_updated',
          resourceType: 'User',
          resourceId: currentUser._id,
          before: previous,
          after: {
            name: currentUser.name,
            phone: currentUser.phone,
            bankDetails: {
              accountHolder: currentUser.bankDetails.accountHolder,
              bankName: currentUser.bankDetails.bankName,
              accountNumberLast4: currentUser.bankDetails.accountNumber?.slice(-4) || '',
              branchCode: currentUser.bankDetails.branchCode,
            },
          },
          session,
        });
      }
      if (req.body.password) {
        await writeAuditLog({
          req,
          action: 'user.password_changed',
          resourceType: 'User',
          resourceId: currentUser._id,
          after: { passwordChanged: true },
          session,
        });
      }
      return currentUser;
    });

      return res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        balance: updatedUser.balance,
        bankDetails: updatedUser.bankDetails,
      });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = { registerUser, loginUser, getUserProfile, updateUserProfile };
