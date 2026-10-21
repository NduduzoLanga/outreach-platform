const express = require('express');
const router = express.Router();
const { requestWithdrawal, getMyWithdrawals, getMyLedger } = require('../controllers/withdrawalController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { bindTenant } = require('../security/tenantContext');

router.use(protect, bindTenant);
router.route('/')
  .post(authorize('consultant'), requestWithdrawal)
  .get(authorize('consultant', 'admin'), getMyWithdrawals);
router.get('/ledger', authorize('consultant', 'admin'), getMyLedger);

module.exports = router;
