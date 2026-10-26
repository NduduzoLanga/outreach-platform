const mongoose = require('mongoose');
const { randomBytes } = require('node:crypto');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Withdrawal = require('../models/Withdrawal');
const Ticket = require('../models/Ticket');
const LedgerEntry = require('../models/LedgerEntry');
const AuditLog = require('../models/AuditLog');
const Agency = require('../models/Agency');
const { writeAuditLog } = require('../services/auditService');
const { runInTransaction } = require('../services/transactionService');
const { toCurrency } = require('../services/money');
const { COMMISSION_PACKAGES } = require('../services/commissionPackages');
const { createInvitationToken, getInvitationUrl, sendInvitationEmail } = require('../services/invitationService');
const { respondWithControllerError } = require('../middleware/controllerError');
const { combineName, splitFullName } = require('../services/userName');

const getAdminStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalConsultants,
      totalSpecialists,
      totalLeads,
      closedWonLeads,
      commissionTotals,
      packageCommissionTotals,
      pendingWithdrawals,
      openTickets,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'consultant' }),
      User.countDocuments({ role: 'specialist' }),
      Lead.countDocuments(),
      Lead.countDocuments({ stage: 'Closed Won' }),
      Lead.aggregate([{ $group: { _id: null, total: { $sum: '$commissionEarned' } } }]),
      Lead.aggregate([
        { $match: { dealPackage: { $in: Object.keys(COMMISSION_PACKAGES) } } },
        { $group: { _id: '$dealPackage', deals: { $sum: 1 }, commission: { $sum: '$commissionEarned' } } },
        { $sort: { _id: 1 } },
      ]),
      Withdrawal.find({ status: { $in: ['Pending', 'Approved'] } }).select('amount'),
      Ticket.countDocuments({ status: { $in: ['Open', 'In Progress'] } }),
    ]);

    return res.json({
      users: { total: totalUsers, consultants: totalConsultants, specialists: totalSpecialists },
      leads: { total: totalLeads, closedWon: closedWonLeads },
      finance: {
        commissionEarned: toCurrency(commissionTotals[0]?.total || 0),
        packageBreakdown: packageCommissionTotals.map((entry) => ({
          package: entry._id,
          deals: entry.deals,
          commission: toCurrency(entry.commission),
        })),
        pendingCount: pendingWithdrawals.length,
        pendingPayoutAmount: toCurrency(pendingWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0)),
      },
      support: { openTickets },
    });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('name firstName lastName email role accountStatus invitedAt invitedBy passwordChangedAt createdAt')
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 });
    return res.json(users.map((user) => {
      const legacyName = splitFullName(user.name);
      return {
        ...user.toObject(),
        firstName: user.firstName || legacyName.firstName,
        lastName: user.lastName || legacyName.lastName,
      };
    }));
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

async function recordInvitationDelivery(req, userId, delivery) {
  await runInTransaction(async (session) => {
    await writeAuditLog({
      req,
      action: delivery.sent ? 'user.invitation_email_sent' : 'user.invitation_email_not_sent',
      resourceType: 'User',
      resourceId: userId,
      after: { deliveryStatus: delivery.sent ? 'sent_to_mail_provider' : delivery.reason },
      session,
    });
  });
}

async function deliverInvitation(req, user, token) {
  let delivery;
  try {
    delivery = await sendInvitationEmail({
      name: user.name,
      email: user.email,
      role: user.role,
      invitationUrl: getInvitationUrl(token),
      invitedBy: req.user.name,
    });
  } catch (error) {
    console.error('Invitation email delivery failed:', error);
    delivery = {
      sent: false,
      reason: typeof error.code === 'string' ? error.code : 'delivery_failed',
    };
  }
  await recordInvitationDelivery(req, user._id, delivery);
  return {
    delivery,
    ...(delivery.sent ? {} : { invitationUrl: getInvitationUrl(token) }),
  };
}

const createUserInvitation = async (req, res) => {
  try {
    const { email, role, phone = '' } = req.body;
    const legacyName = typeof req.body.name === 'string' ? splitFullName(req.body.name) : null;
    const firstNameInput = req.body.firstName ?? legacyName?.firstName;
    const lastNameInput = req.body.lastName ?? legacyName?.lastName;
    const firstName = typeof firstNameInput === 'string' ? firstNameInput.trim() : '';
    const lastName = typeof lastNameInput === 'string' ? lastNameInput.trim() : '';
    if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60) {
      return res.status(400).json({ message: 'First and last name are required and must be 60 characters or fewer.' });
    }
    const name = combineName(firstName, lastName);
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!['consultant', 'specialist'].includes(role)) {
      return res.status(400).json({ message: 'Choose consultant or specialist. Administrator access is managed separately.' });
    }
    if (typeof phone !== 'string' || phone.length > 32 || (phone && !/^[+()\d\s.-]+$/.test(phone))) {
      return res.status(400).json({ message: 'Enter a valid phone number of at most 32 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ message: 'An account already exists for this email address.' });
    }
    const invitation = createInvitationToken();
    const initialPassword = randomBytes(32).toString('hex');
    const user = await runInTransaction(async (session) => {
      const [created] = await User.create([{
        tenantId: req.tenantId,
        name,
        firstName,
        lastName,
        email: normalizedEmail,
        password: initialPassword,
        role,
        phone: phone.trim(),
        accountStatus: 'pending_invitation',
        invitationTokenHash: invitation.tokenHash,
        invitationExpiresAt: invitation.expiresAt,
        invitedAt: new Date(),
        invitedBy: req.user._id,
      }], { session });
      await writeAuditLog({
        req,
        action: 'user.invitation_created',
        resourceType: 'User',
        resourceId: created._id,
        after: { email: created.email, role: created.role, accountStatus: created.accountStatus, expiresAt: invitation.expiresAt },
        session,
      });
      return created;
    });
    const result = await deliverInvitation(req, user, invitation.token);
    return res.status(201).json({
      message: result.delivery.sent
        ? 'Account invitation created and email accepted by the configured mail provider.'
        : 'Account invitation created, but email delivery is not configured or failed. Share the one-time setup link securely with the invitee.',
      user: {
        _id: user._id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        invitationExpiresAt: invitation.expiresAt,
      },
      delivery: result.delivery,
      ...(result.invitationUrl ? { invitationUrl: result.invitationUrl } : {}),
    });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const resendUserInvitation = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
    const invitation = createInvitationToken();
    const user = await runInTransaction(async (session) => {
      const current = await User.findById(req.params.id).session(session);
      if (!current) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
      }
      const canReplacePendingInvite = current.accountStatus === 'pending_invitation'
        || (current.accountStatus === 'suspended' && current.invitedAt && !current.passwordChangedAt);
      if (!canReplacePendingInvite || !['consultant', 'specialist'].includes(current.role)) {
        const error = new Error('Only an account with a pending invitation can receive a replacement invitation.');
        error.statusCode = 409;
        throw error;
      }
      current.accountStatus = 'pending_invitation';
      current.invitationTokenHash = invitation.tokenHash;
      current.invitationExpiresAt = invitation.expiresAt;
      current.invitedAt = new Date();
      current.invitedBy = req.user._id;
      await current.save({ session });
      await writeAuditLog({
        req,
        action: 'user.invitation_resent',
        resourceType: 'User',
        resourceId: current._id,
        after: { accountStatus: current.accountStatus, expiresAt: invitation.expiresAt },
        session,
      });
      return current;
    });
    const result = await deliverInvitation(req, user, invitation.token);
    return res.json({
      message: result.delivery.sent
        ? 'Replacement invitation email accepted by the configured mail provider.'
        : 'Replacement invitation created, but email delivery is not configured or failed. Share the one-time setup link securely with the invitee.',
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, accountStatus: user.accountStatus, invitationExpiresAt: invitation.expiresAt },
      delivery: result.delivery,
      ...(result.invitationUrl ? { invitationUrl: result.invitationUrl } : {}),
    });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const updateUserStatus = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
    const { accountStatus } = req.body;
    if (!['active', 'suspended'].includes(accountStatus)) {
      return res.status(400).json({ message: 'Choose active or suspended account status.' });
    }
    const user = await runInTransaction(async (session) => {
      const current = await User.findById(req.params.id).session(session);
      if (!current) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
      }
      if (current._id.toString() === req.user._id.toString() || current.role === 'admin') {
        const error = new Error('Administrator accounts cannot be suspended from this roster action.');
        error.statusCode = 409;
        throw error;
      }
      if (current.accountStatus === 'pending_invitation' && accountStatus === 'active') {
        const error = new Error('The user must accept the invitation and set a password before activation.');
        error.statusCode = 409;
        throw error;
      }
      if (
        current.accountStatus === 'suspended'
        && accountStatus === 'active'
        && current.invitedAt
        && !current.passwordChangedAt
      ) {
        const error = new Error('This account has not completed setup. Resend its invitation instead of activating it directly.');
        error.statusCode = 409;
        throw error;
      }
      const previousStatus = current.accountStatus;
      current.accountStatus = accountStatus;
      if (accountStatus === 'suspended') {
        current.invitationTokenHash = undefined;
        current.invitationExpiresAt = null;
      }
      await current.save({ session });
      await writeAuditLog({
        req,
        action: 'user.account_status_changed',
        resourceType: 'User',
        resourceId: current._id,
        before: { accountStatus: previousStatus },
        after: { accountStatus },
        session,
      });
      return current;
    });
    return res.json({
      message: `Account ${accountStatus === 'suspended' ? 'suspended' : 'reactivated'}.`,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, accountStatus: user.accountStatus },
    });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const parsedLimit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ message: 'Audit log page size must be between 1 and 100.' });
    }

    let filter = {};
    if (req.query.cursor) {
      if (typeof req.query.cursor !== 'string' || req.query.cursor.length > 512) {
        return res.status(400).json({ message: 'Invalid audit log cursor.' });
      }
      let cursor;
      try {
        cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
      } catch {
        return res.status(400).json({ message: 'Invalid audit log cursor.' });
      }
      if (
        !cursor
        || !mongoose.isValidObjectId(cursor.id)
        || typeof cursor.createdAt !== 'string'
        || Number.isNaN(Date.parse(cursor.createdAt))
      ) {
        return res.status(400).json({ message: 'Invalid audit log cursor.' });
      }
      const createdAt = new Date(cursor.createdAt);
      filter = {
        $or: [
          { createdAt: { $lt: createdAt } },
          { createdAt, _id: { $lt: cursor.id } },
        ],
      };
    }

    const records = await AuditLog.find(filter)
      .select('actor action resourceType resourceId before after ipAddress requestId createdAt')
      .populate('actor', 'name email')
      .sort({ createdAt: -1, _id: -1 })
      .limit(parsedLimit + 1);
    const hasMore = records.length > parsedLimit;
    const logs = hasMore ? records.slice(0, parsedLimit) : records;
    const lastLog = logs[logs.length - 1];
    const nextCursor = hasMore && lastLog
      ? Buffer.from(JSON.stringify({ createdAt: lastLog.createdAt.toISOString(), id: lastLog._id.toString() })).toString('base64url')
      : null;
    return res.json({ logs, nextCursor });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['consultant', 'specialist', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role provided' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const result = await runInTransaction(async (session) => {
      const agencyLock = await Agency.updateOne(
        { _id: req.tenantId },
        { $inc: { roleChangeVersion: 1 } },
        { session }
      );
      if (!agencyLock.matchedCount) {
        const error = new Error('The active agency could not be found.');
        error.statusCode = 503;
        throw error;
      }
      const user = await User.findById(req.params.id).session(session);
      if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }
      if (user._id.toString() === req.user._id.toString() && role !== 'admin') {
        const error = new Error('You cannot remove your own administrator access.');
        error.statusCode = 409;
        throw error;
      }
      if (user.role === 'admin' && role !== 'admin') {
        const adminsCount = await User.countDocuments({ role: 'admin' }).session(session);
        if (adminsCount <= 1) {
          const error = new Error('The last administrator cannot be demoted.');
          error.statusCode = 409;
          throw error;
        }
      }

      const previousRole = user.role;
      user.role = role;
      await user.save({ session });
      if (previousRole === 'specialist' && role !== 'specialist') {
        const assignedLeads = await Lead.find({ assignedSpecialist: user._id })
          .select('_id')
          .session(session);
        await Lead.updateMany(
          { assignedSpecialist: user._id },
          { $set: { assignedSpecialist: null }, $push: { transferHistory: { from: user._id, to: null, changedBy: req.user._id, reason: 'Specialist role removed' } } },
          { session }
        );
        for (const lead of assignedLeads) {
          await writeAuditLog({
            req,
            action: 'lead.specialist_released',
            resourceType: 'Lead',
            resourceId: lead._id,
            before: { assignedSpecialist: user._id },
            after: { assignedSpecialist: null, reason: 'Specialist role removed' },
            session,
          });
        }
      }
      await writeAuditLog({
        req,
        action: 'user.role_changed',
        resourceType: 'User',
        resourceId: user._id,
        before: { role: previousRole },
        after: { role },
        session,
      });
      return { _id: user._id, name: user.name, email: user.email, role: user.role };
    });
    return res.json({ message: `User role updated to ${role}`, user: result });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const processWithdrawal = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    if (!['Approved', 'Processed', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid withdrawal status.' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid withdrawal ID.' });
    }
    if (adminNotes !== undefined && (typeof adminNotes !== 'string' || adminNotes.length > 2000)) {
      return res.status(400).json({ message: 'Admin notes must be text under 2,000 characters.' });
    }

    const updated = await runInTransaction(async (session) => {
      const withdrawal = await Withdrawal.findById(req.params.id).session(session);
      if (!withdrawal) {
        const error = new Error('Withdrawal request not found.');
        error.statusCode = 404;
        throw error;
      }

      const previousStatus = withdrawal.status;
      const allowedTransitions = {
        Pending: ['Approved', 'Rejected'],
        Approved: ['Processed', 'Rejected'],
      };
      if (!allowedTransitions[previousStatus]?.includes(status)) {
        const error = new Error(`Cannot change withdrawal from ${previousStatus} to ${status}.`);
        error.statusCode = 409;
        throw error;
      }

      const consultant = await User.findById(withdrawal.consultant).session(session);
      if (!consultant) {
        const error = new Error('The consultant for this withdrawal no longer exists.');
        error.statusCode = 409;
        throw error;
      }
      const balanceBefore = consultant.balance;
      if (status === 'Rejected') {
        consultant.balance = toCurrency(consultant.balance + withdrawal.amount);
        await consultant.save({ session });
      }

      withdrawal.status = status;
      if (adminNotes !== undefined) withdrawal.adminNotes = adminNotes;
      if (status === 'Processed') withdrawal.processedAt = new Date();
      withdrawal.statusEvents.push({ status, actor: req.user._id, note: adminNotes || '' });
      await withdrawal.save({ session });

      const ledgerType = status === 'Approved'
        ? 'withdrawal_approved'
        : status === 'Processed'
          ? 'withdrawal_paid'
          : 'withdrawal_refunded';
      await LedgerEntry.create([{
        consultant: consultant._id,
        withdrawal: withdrawal._id,
        actor: req.user._id,
        type: ledgerType,
        amount: withdrawal.amount,
        availableBalanceBefore: balanceBefore,
        availableBalanceAfter: consultant.balance,
        payoutSnapshot: withdrawal.payoutSnapshot,
      }], { session });
      await writeAuditLog({
        req,
        action: `withdrawal.${status.toLowerCase()}`,
        resourceType: 'Withdrawal',
        resourceId: withdrawal._id,
        before: { status: previousStatus, balance: balanceBefore },
        after: { status, balance: consultant.balance, adminNotes: withdrawal.adminNotes },
        session,
      });
      return withdrawal;
    });
    return res.json({ message: `Withdrawal status updated to ${status}`, withdrawal: updated });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const assignLeadSpecialist = async (req, res) => {
  try {
    const { specialistId } = req.body;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lead ID' });
    }
    if (specialistId !== null && !mongoose.isValidObjectId(specialistId)) {
      return res.status(400).json({ message: 'A valid specialist ID or null is required.' });
    }

    const reason = req.body.reason;
    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 2000) {
      return res.status(400).json({ message: 'A reason of at least 5 characters is required for assignment changes.' });
    }

    const lead = await runInTransaction(async (session) => {
      if (specialistId) {
        const specialist = await User.findOneAndUpdate(
          { _id: specialistId, role: 'specialist' },
          { $inc: { assignmentVersion: 1 } },
          { new: true, session }
        )
          .select('_id')
          .session(session);
        if (!specialist) {
          const error = new Error('Selected user is not a lead specialist.');
          error.statusCode = 400;
          throw error;
        }
      }
      const currentLead = await Lead.findById(req.params.id).session(session);
      if (!currentLead) {
        const error = new Error('Lead not found');
        error.statusCode = 404;
        throw error;
      }
      const previousSpecialist = currentLead.assignedSpecialist || null;
      if (String(previousSpecialist || '') === String(specialistId || '')) {
        return Lead.populate(currentLead, [
          { path: 'consultant', select: 'name email' },
          { path: 'assignedSpecialist', select: 'name email' },
        ]);
      }
      currentLead.assignedSpecialist = specialistId;
      currentLead.transferHistory.push({
        from: previousSpecialist,
        to: specialistId,
        changedBy: req.user._id,
        reason: reason.trim(),
      });
      await currentLead.save({ session });
      await writeAuditLog({
        req,
        action: 'lead.specialist_assigned',
        resourceType: 'Lead',
        resourceId: currentLead._id,
        before: { assignedSpecialist: previousSpecialist },
        after: { assignedSpecialist: specialistId, reason: reason.trim() },
        session,
      });
      return Lead.populate(currentLead, [
        { path: 'consultant', select: 'name email' },
        { path: 'assignedSpecialist', select: 'name email' },
      ]);
    });
    return res.json({ message: 'Lead assignment updated.', lead });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getAdminTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate('consultant', 'name email role')
      .sort({ updatedAt: -1 });
    return res.json(tickets);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Open', 'In Progress', 'Resolved', 'Closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid ticket status.' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ticket ID.' });
    }
    const ticket = await runInTransaction(async (session) => {
      const current = await Ticket.findById(req.params.id).session(session);
      if (!current) {
        const error = new Error('Ticket not found.');
        error.statusCode = 404;
        throw error;
      }
      const previousStatus = current.status;
      current.status = status;
      await current.save({ session });
      await writeAuditLog({
        req,
        action: 'ticket.status_changed',
        resourceType: 'Ticket',
        resourceId: current._id,
        before: { status: previousStatus },
        after: { status },
        session,
      });
      return current;
    });
    await ticket.populate('consultant', 'name email role');
    return res.json(ticket);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const replyToTicket = async (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim() || text.length > 10000) {
      return res.status(400).json({ message: 'Reply must be text under 10,000 characters.' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ticket ID.' });
    }
    const ticket = await runInTransaction(async (session) => {
      const current = await Ticket.findById(req.params.id).session(session);
      if (!current) {
        const error = new Error('Ticket not found.');
        error.statusCode = 404;
        throw error;
      }
      const previousStatus = current.status;
      current.messages.push({
        sender: req.user.role,
        senderId: req.user._id,
        senderRole: req.user.role,
        senderName: req.user.name,
        text: text.trim(),
      });
      if (current.status !== 'In Progress') current.status = 'In Progress';
      await current.save({ session });
      await writeAuditLog({
        req,
        action: 'ticket.support_reply',
        resourceType: 'Ticket',
        resourceId: current._id,
        before: { status: previousStatus },
        after: { status: current.status, reply: text.trim() },
        session,
      });
      return current;
    });
    await ticket.populate('consultant', 'name email role');
    return res.json(ticket);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = {
  getAdminStats,
  getUsers,
  createUserInvitation,
  resendUserInvitation,
  updateUserStatus,
  getAuditLogs,
  updateUserRole,
  processWithdrawal,
  assignLeadSpecialist,
  getAdminTickets,
  updateTicketStatus,
  replyToTicket,
};
