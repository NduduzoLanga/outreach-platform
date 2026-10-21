const express = require('express');
const router = express.Router();
const { getStatementSummary } = require('../controllers/statementController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { bindTenant } = require('../security/tenantContext');

router.get('/summary', protect, bindTenant, authorize('consultant'), getStatementSummary);

module.exports = router;
