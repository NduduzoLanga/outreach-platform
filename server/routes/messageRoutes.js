const express = require('express');
const { getMessages, markMessageRead } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');
const { bindTenant } = require('../security/tenantContext');

const router = express.Router();

router.use(protect, bindTenant);
router.get('/', getMessages);
router.patch('/:id/read', markMessageRead);

module.exports = router;
