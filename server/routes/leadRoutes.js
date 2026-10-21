const express = require('express');
const router = express.Router();
const {
  createLead,
  getMyLeads,
  updateLead,
  deleteLead,
  claimLead,
  createLeadAppointment,
  updateLeadAppointment,
  addLeadActivity,
} = require('../controllers/leadController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { bindTenant } = require('../security/tenantContext');

router.use(protect, bindTenant);
router.route('/')
  .post(authorize('consultant'), createLead)
  .get(getMyLeads);

router.put('/:id/claim', authorize('specialist'), claimLead);
router.post('/:id/activities', authorize('specialist', 'admin'), addLeadActivity);
router.post('/:id/appointments', authorize('specialist', 'admin'), createLeadAppointment);
router.patch('/:id/appointments/:appointmentId', authorize('specialist', 'admin'), updateLeadAppointment);
router.route('/:id')
  .put(authorize('consultant', 'specialist', 'admin'), updateLead)
  .delete(authorize('consultant'), deleteLead);

module.exports = router;
