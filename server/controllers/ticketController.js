const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const { respondWithControllerError } = require('../middleware/controllerError');

const createTicket = async (req, res) => {
  try {
    const { subject, category, priority, initialMessage } = req.body;
    if (
      typeof subject !== 'string' || !subject.trim()
      || typeof category !== 'string'
      || typeof initialMessage !== 'string' || !initialMessage.trim()
      || subject.length > 180
      || initialMessage.length > 10000
    ) {
      return res.status(400).json({ message: 'Subject, category, and message body are required.' });
    }

    const ticket = await Ticket.create({
      consultant: req.user._id,
      subject: subject.trim(),
      category,
      priority: priority || 'Medium',
      messages: [{
        sender: req.user.role,
        senderId: req.user._id,
        senderRole: req.user.role,
        senderName: req.user.name,
        text: initialMessage.trim(),
      }],
    });
    return res.status(201).json(ticket);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({ consultant: req.user._id }).sort({ updatedAt: -1 });
    return res.json(tickets);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const replyTicket = async (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim() || text.length > 10000) {
      return res.status(400).json({ message: 'Reply message cannot be empty.' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid ticket ID.' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }
    if (ticket.consultant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this ticket.' });
    }

    ticket.messages.push({
      sender: req.user.role,
      senderId: req.user._id,
      senderRole: req.user.role,
      senderName: req.user.name,
      text: text.trim(),
    });
    ticket.status = 'Open';
    const updatedTicket = await ticket.save();
    return res.json(updatedTicket);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = { createTicket, getMyTickets, replyTicket };
