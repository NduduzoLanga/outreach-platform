const mongoose = require('mongoose');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const User = require('../models/User');
const { writeAuditLog } = require('../services/auditService');
const { runInTransaction } = require('../services/transactionService');
const { respondWithControllerError } = require('../middleware/controllerError');

const getMessages = async (req, res) => {
  try {
    const messages = await WorkspaceMessage.find({
      $or: [
        { audience: 'all_accounts' },
        { recipientIds: req.user._id },
      ],
    })
      .select('type title body lead recipientIds audience createdBy readBy createdAt')
      .populate('createdBy', 'name role')
      .populate('lead', 'clientName centerName')
      .sort({ createdAt: -1, _id: -1 })
      .limit(100);
    return res.json(messages);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const markMessageRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid message ID.' });
    }
    const message = await WorkspaceMessage.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { audience: 'all_accounts' },
          { recipientIds: req.user._id },
        ],
      },
      { $addToSet: { readBy: req.user._id } },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: 'Message not found.' });
    return res.json({ message: 'Message marked as read.', id: message._id });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const createAnnouncement = async (req, res) => {
  try {
    const { title, body } = req.body;
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 180) {
      return res.status(400).json({ message: 'Announcement title is required and must be 180 characters or fewer.' });
    }
    if (typeof body !== 'string' || !body.trim() || body.trim().length > 10000) {
      return res.status(400).json({ message: 'Announcement message is required and must be 10,000 characters or fewer.' });
    }

    const audienceSize = await User.countDocuments();
    const announcement = await runInTransaction(async (session) => {
      const [created] = await WorkspaceMessage.create([{
        tenantId: req.tenantId,
        type: 'announcement',
        title: title.trim(),
        body: body.trim(),
        audience: 'all_accounts',
        createdBy: req.user._id,
      }], { session });
      await writeAuditLog({
        req,
        action: 'announcement.broadcast',
        resourceType: 'WorkspaceMessage',
        resourceId: created._id,
        after: { title: created.title, audience: 'all_accounts', audienceSize },
        session,
      });
      return created;
    });
    await announcement.populate('createdBy', 'name role');
    return res.status(201).json({
      message: `Announcement published to the workspace for ${audienceSize} account${audienceSize === 1 ? '' : 's'}.`,
      announcement,
      audienceSize,
    });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = { getMessages, markMessageRead, createAnnouncement };
