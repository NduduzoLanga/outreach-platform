const mongoose = require('mongoose');
const PaymentInvoice = require('../models/PaymentInvoice');
const { invoiceView } = require('../services/paymentInvoiceService');
const { respondWithControllerError } = require('../middleware/controllerError');

async function listInvoices(req, baseFilter) {
  const parsedLimit = Number(req.query.limit ?? 100);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    const error = new Error('Invoice history page size must be between 1 and 200.');
    error.statusCode = 400;
    throw error;
  }
  let filter = baseFilter;
  if (req.query.cursor) {
    if (typeof req.query.cursor !== 'string' || req.query.cursor.length > 512) {
      const error = new Error('Invalid invoice history cursor.');
      error.statusCode = 400;
      throw error;
    }
    let cursor;
    try {
      cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
    } catch {
      const error = new Error('Invalid invoice history cursor.');
      error.statusCode = 400;
      throw error;
    }
    if (!cursor || !mongoose.isValidObjectId(cursor.id) || typeof cursor.issuedAt !== 'string' || Number.isNaN(Date.parse(cursor.issuedAt))) {
      const error = new Error('Invalid invoice history cursor.');
      error.statusCode = 400;
      throw error;
    }
    filter = {
      $and: [
        baseFilter,
        {
          $or: [
            { issuedAt: { $lt: new Date(cursor.issuedAt) } },
            { issuedAt: new Date(cursor.issuedAt), _id: { $lt: cursor.id } },
          ],
        },
      ],
    };
  }
  const records = await PaymentInvoice.find(filter)
    .select('-htmlContent -textContent')
    .populate('settlementEvents.actor', 'name email')
    .sort({ issuedAt: -1, _id: -1 })
    .limit(parsedLimit + 1);
  const hasMore = records.length > parsedLimit;
  const invoices = hasMore ? records.slice(0, parsedLimit) : records;
  const lastInvoice = invoices[invoices.length - 1];
  const nextCursor = hasMore && lastInvoice
    ? Buffer.from(JSON.stringify({ issuedAt: lastInvoice.issuedAt.toISOString(), id: lastInvoice._id.toString() })).toString('base64url')
    : null;
  return { invoices, nextCursor };
}

const getMyInvoices = async (req, res) => {
  try {
    const result = await listInvoices(req, { recipient: req.user._id });
    return res.json(result);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getMyInvoice = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid invoice ID.' });
    const invoice = await PaymentInvoice.findOne({ _id: req.params.id, recipient: req.user._id })
      .populate('settlementEvents.actor', 'name email');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
    return res.json(invoiceView(invoice));
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getAdminInvoices = async (req, res) => {
  try {
    const result = await listInvoices(req, {});
    return res.json(result);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getAdminInvoice = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid invoice ID.' });
    const invoice = await PaymentInvoice.findById(req.params.id)
      .populate('settlementEvents.actor', 'name email');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
    return res.json(invoiceView(invoice));
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = { getMyInvoices, getMyInvoice, getAdminInvoices, getAdminInvoice };
