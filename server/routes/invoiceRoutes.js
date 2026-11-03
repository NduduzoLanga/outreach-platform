const express = require('express');
const { getMyInvoices, getMyInvoice } = require('../controllers/paymentInvoiceController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { bindTenant } = require('../security/tenantContext');

const router = express.Router();

router.use(protect, bindTenant, authorize('consultant', 'specialist'));
router.get('/', getMyInvoices);
router.get('/:id', getMyInvoice);

module.exports = router;
