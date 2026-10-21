const Lead = require('../models/Lead');
const Withdrawal = require('../models/Withdrawal');
const { respondWithControllerError } = require('../middleware/controllerError');

const getStatementSummary = async (req, res) => {
  try {
    if (req.query.month !== undefined && typeof req.query.month !== 'string') {
      return res.status(400).json({ message: 'Select a valid statement month in YYYY-MM format.' });
    }
    const month = typeof req.query.month === 'string' ? req.query.month : new Date().toISOString().slice(0, 7);
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
      return res.status(400).json({ message: 'Select a valid statement month in YYYY-MM format.' });
    }
    const startDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    const endDate = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
    const now = new Date();
    if (startDate.toISOString().slice(0, 7) !== month) {
      return res.status(400).json({ message: 'Select a valid statement month in YYYY-MM format.' });
    }
    if (startDate > new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) {
      return res.status(400).json({ message: 'A statement cannot be generated for a future month.' });
    }
    const periodFilter = { $gte: startDate, $lt: endDate };
    const userId = req.user._id;
    const [leads, closedWonLeads, withdrawals, withdrawalTotals] = await Promise.all([
      Lead.find({ consultant: userId, createdAt: periodFilter }).select('estimatedValue'),
      Lead.find({ consultant: userId, commissionCreditedAt: periodFilter }).select('commissionEarned'),
      Withdrawal.find({ consultant: userId, createdAt: periodFilter }).sort({ createdAt: -1 }).limit(5),
      Withdrawal.aggregate([
        { $match: { consultant: userId, createdAt: periodFilter } },
        {
          $group: {
            _id: null,
            totalRequested: { $sum: '$amount' },
            totalPaidOut: {
              $sum: { $cond: [{ $eq: ['$status', 'Processed'] }, '$amount', 0] },
            },
          },
        },
      ]),
    ]);

    const totals = withdrawalTotals[0] || { totalRequested: 0, totalPaidOut: 0 };
    return res.json({
      consultant: {
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        currentBalance: req.user.balance,
      },
      period: { month, startsAt: startDate, endsAt: endDate },
      metrics: {
        totalLeads: leads.length,
        closedWonCount: closedWonLeads.length,
        totalPipelineValue: leads.reduce((sum, lead) => sum + (lead.estimatedValue || 0), 0),
        totalCommissionEarned: closedWonLeads.reduce((sum, lead) => sum + (lead.commissionEarned || 0), 0),
        totalWithdrawalsRequested: totals.totalRequested,
        totalPaidOut: totals.totalPaidOut,
      },
      recentWithdrawals: withdrawals,
    });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = { getStatementSummary };
