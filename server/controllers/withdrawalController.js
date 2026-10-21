const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const LedgerEntry = require('../models/LedgerEntry');
const { writeAuditLog } = require('../services/auditService');
const { runInTransaction } = require('../services/transactionService');
const { toCurrency, isCentAmount } = require('../services/money');
const { respondWithControllerError } = require('../middleware/controllerError');

const requestWithdrawal = async (req, res) => {
  try {
    const numericAmount = Number(req.body.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !isCentAmount(numericAmount)) {
      return res.status(400).json({ message: 'Please enter a valid withdrawal amount.' });
    }
    const amount = toCurrency(numericAmount);

    const withdrawal = await runInTransaction(async (session) => {
      const user = await User.findById(req.user._id).session(session);
      if (!user) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
      }
      if (!user.bankDetails?.bankName || !user.bankDetails?.accountNumber) {
        const error = new Error('Please complete your banking details in your Profile before requesting a withdrawal.');
        error.statusCode = 400;
        throw error;
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true, session }
      );
      if (!updatedUser) {
        const error = new Error(`Insufficient balance. Available: R${Number(user.balance).toFixed(2)}`);
        error.statusCode = 400;
        throw error;
      }
      updatedUser.balance = toCurrency(updatedUser.balance);
      await updatedUser.save({ session });

      const payoutSnapshot = {
        bankName: user.bankDetails.bankName,
        accountNumber: user.bankDetails.accountNumber,
        accountHolder: user.bankDetails.accountHolder || user.name,
      };
      const [createdWithdrawal] = await Withdrawal.create([{
        consultant: user._id,
        amount,
        payoutSnapshot,
        statusEvents: [{ status: 'Pending', actor: user._id }],
      }], { session });

      await LedgerEntry.create([{
        consultant: user._id,
        withdrawal: createdWithdrawal._id,
        actor: user._id,
        type: 'withdrawal_reserved',
        amount,
        availableBalanceBefore: user.balance,
        availableBalanceAfter: updatedUser.balance,
        payoutSnapshot,
      }], { session });

      await writeAuditLog({
        req,
        action: 'withdrawal.requested',
        resourceType: 'Withdrawal',
        resourceId: createdWithdrawal._id,
        before: { balance: user.balance },
        after: { amount, status: 'Pending', balance: updatedUser.balance, payoutSnapshot },
        session,
      });
      return createdWithdrawal;
    });
    return res.status(201).json(withdrawal);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getMyWithdrawals = async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { consultant: req.user._id };
    let withdrawalsQuery = Withdrawal.find(query).sort({ createdAt: -1 });
    if (req.user.role === 'admin') withdrawalsQuery = withdrawalsQuery.populate('consultant', 'name email');
    return res.json(await withdrawalsQuery);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getMyLedger = async (req, res) => {
  try {
    const entries = await LedgerEntry.find({ consultant: req.user._id })
      .populate('lead', 'clientName')
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json(entries);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = { requestWithdrawal, getMyWithdrawals, getMyLedger };
