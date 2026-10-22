const express = require('express');
const router = express.Router();
const { loginUser, acceptInvitation, getUserProfile, updateUserProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { bindTenant } = require('../security/tenantContext');

router.post('/login', loginUser);
router.post('/accept-invitation', acceptInvitation);
router.get('/profile', protect, bindTenant, getUserProfile);
router.put('/profile', protect, bindTenant, updateUserProfile);

module.exports = router;
