const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getUserProfile, updateUserProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { bindTenant } = require('../security/tenantContext');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/profile', protect, bindTenant, getUserProfile);
router.put('/profile', protect, bindTenant, updateUserProfile);

module.exports = router;
