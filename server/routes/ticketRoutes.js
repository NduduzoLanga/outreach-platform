const express = require('express');
const router = express.Router();
const { createTicket, getMyTickets, replyTicket } = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');
const { bindTenant } = require('../security/tenantContext');

router.use(protect, bindTenant);
router.route('/')
  .post(createTicket)
  .get(getMyTickets);

router.post('/:id/reply', replyTicket);

module.exports = router;
