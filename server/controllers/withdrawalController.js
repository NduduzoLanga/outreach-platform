const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const LedgerEntry = require('../models/LedgerEntry');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const { writeAuditLog } = require('../services/auditService');
const { runInTransaction } = require('../services/transactionService');
const { toCurrency, isCentAmount } = require('../services/money');
const { respondWithControllerError } = require('../middleware/controllerError');

async function getLockedSalaryBalance(user, session) {
  const restrictedPaymentTypes = user.role === 'specialist'
    ? ['referral_additional_incentive', 'salary']
    : ['salary'];
  const [restrictedCredits, completedSalaryPayments] = await Promise.all([
    LedgerEntry.aggregate([
      { $match: { consultant: user._id, type: 'income_assigned', incentiveType: { $in: restrictedPaymentTypes } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).session(session || null),
    LedgerEntry.aggregate([
      { $match: { consultant: user._id, type: 'income_paid', incentiveType: { $in: restrictedPaymentTypes } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).session(session || null),
  ]);
  return toCurrency(Math.max(
    0,
    Number(restrictedCredits[0]?.total || 0) - Number(completedSalaryPayments[0]?.total || 0)
  ));
}

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

      const lockedSalaryBalance = await getLockedSalaryBalance(user, session);

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id, balance: { $gte: toCurrency(amount + lockedSalaryBalance) } },
        { $inc: { balance: -amount } },
        { new: true, session }
      );
      if (!updatedUser) {
        const available = Math.max(0, toCurrency(user.balance - lockedSalaryBalance));
        const error = new Error(`Insufficient withdrawable balance. Available: R${available.toFixed(2)}${lockedSalaryBalance ? `; R${lockedSalaryBalance.toFixed(2)} is reserved for salary payment` : ''}.`);
        error.statusCode = 400;
        throw error;
      }
      updatedUser.balance = toCurrency(updatedUser.balance);
      await updatedUser.save({ session });

      const payoutSnapshot = {
        bankName: user.bankDetails.bankName,
        accountNumber: user.bankDetails.accountNumber,
        accountHolder: user.bankDetails.accountHolder || user.name,
        branchCode: user.bankDetails.branchCode || '',
      };
      const [createdWithdrawal] = await Withdrawal.create([{
        tenantId: req.tenantId,
        consultant: user._id,
        amount,
        payoutSnapshot,
        statusEvents: [{ status: 'Pending', actor: user._id }],
      }], { session });

      await LedgerEntry.create([{
        tenantId: req.tenantId,
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
      const admins = await User.find({ role: 'admin', accountStatus: 'active' }).select('_id').session(session);
      if (!admins.length) {
        const error = new Error('No active administrator is available to receive the withdrawal request.');
        error.statusCode = 503;
        throw error;
      }
      await WorkspaceMessage.create([{
        tenantId: req.tenantId,
        type: 'withdrawal_requested',
        title: 'New withdrawal request',
        body: `${user.name} (${user.email}, ${user.role === 'specialist' ? 'Lead specialist' : 'Consultant'}) requested R${amount.toFixed(2)} on ${new Date().toLocaleString('en-ZA')}. Payout destination: ${payoutSnapshot.accountHolder}, ${payoutSnapshot.bankName}, account ${payoutSnapshot.accountNumber}, branch ${payoutSnapshot.branchCode || 'not provided'}.`,
        withdrawal: createdWithdrawal._id,
        recipientIds: admins.map((admin) => admin._id),
        audience: 'selected_users',
        createdBy: user._id,
      }], { session });
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
    withdrawalsQuery = withdrawalsQuery.populate('statusEvents.actor', 'name email role');
    if (req.user.role === 'admin') withdrawalsQuery = withdrawalsQuery.populate('consultant', 'name email role employeeId');
    return res.json(await withdrawalsQuery);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getMyLedger = async (req, res) => {
  try {
    const entries = await LedgerEntry.find({ consultant: req.user._id })
      .populate('lead', 'clientName centerName dealPackage')
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json(entries);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getWithdrawalAvailability = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const lockedSalaryBalance = await getLockedSalaryBalance(user);
    return res.json({
      balance: toCurrency(user.balance),
      lockedSalaryBalance,
      withdrawableBalance: toCurrency(Math.max(0, user.balance - lockedSalaryBalance)),
      role: user.role,
    });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = { requestWithdrawal, getMyWithdrawals, getMyLedger, getWithdrawalAvailability };
