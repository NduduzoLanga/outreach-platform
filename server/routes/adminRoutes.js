const express = require('express');
const {
  getAdminStats,
  getUsers,
  getAdminPayments,
  assignIncome,
  createUserInvitation,
  resendUserInvitation,
  updateUserStatus,
  getAuditLogs,
  updateUserRole,
  processWithdrawal,
  settleIncomeInvoice,
  assignLeadSpecialist,
  getAdminTickets,
  updateTicketStatus,
  replyToTicket,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { bindTenant } = require('../security/tenantContext');
const { createAnnouncement } = require('../controllers/messageController');
const { getAdminInvoices, getAdminInvoice } = require('../controllers/paymentInvoiceController');

const router = express.Router();

router.use(protect, bindTenant, authorize('admin'));
router.get('/stats', getAdminStats);
router.get('/users', getUsers);
router.get('/payments', getAdminPayments);
router.get('/payments/invoices', getAdminInvoices);
router.get('/payments/invoices/:id', getAdminInvoice);
router.post('/payments/invoices/:id/settlements', settleIncomeInvoice);
router.post('/payments/assign-income', assignIncome);
router.post('/announcements', createAnnouncement);
router.post('/users/invitations', createUserInvitation);
router.post('/users/:id/resend-invitation', resendUserInvitation);
router.patch('/users/:id/status', updateUserStatus);
router.get('/audit-logs', getAuditLogs);
router.put('/users/:id/role', updateUserRole);
router.put('/withdrawals/:id/status', processWithdrawal);
router.put('/leads/:id/assign', assignLeadSpecialist);
router.get('/tickets', getAdminTickets);
router.put('/tickets/:id/status', updateTicketStatus);
router.post('/tickets/:id/reply', replyToTicket);

module.exports = router;
