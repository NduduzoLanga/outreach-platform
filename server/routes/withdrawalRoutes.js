const express = require('express');
const router = express.Router();
const { requestWithdrawal, getMyWithdrawals, getMyLedger, getWithdrawalAvailability } = require('../controllers/withdrawalController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { bindTenant } = require('../security/tenantContext');

router.use(protect, bindTenant);
router.route('/')
  .post(authorize('consultant', 'specialist'), requestWithdrawal)
  .get(authorize('consultant', 'specialist', 'admin'), getMyWithdrawals);
router.get('/ledger', authorize('consultant', 'specialist', 'admin'), getMyLedger);
router.get('/availability', authorize('consultant', 'specialist'), getWithdrawalAvailability);

module.exports = router;
