const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');

const ticketSchema = new mongoose.Schema(
  {
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    category: {
      type: String,
      enum: ['Lead Issue', 'Payout / Withdrawal', 'Technical', 'General Query'],
      required: true,
    },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open' },
    messages: [
      {
        sender: { type: String, enum: ['consultant', 'specialist', 'admin', 'support'], required: true },
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        senderRole: { type: String, enum: ['consultant', 'specialist', 'admin'], default: null },
        senderName: { type: String, default: '' },
        text: { type: String, required: true, maxlength: 10000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

ticketSchema.plugin(tenantPlugin);
ticketSchema.index({ tenantId: 1, consultant: 1, updatedAt: -1 });
ticketSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('Ticket', ticketSchema);
