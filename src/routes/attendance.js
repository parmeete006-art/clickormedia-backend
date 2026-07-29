const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const {
  myAttendance,
  checkIn,
  checkOut,
  allAttendance,
  biometricWebhook,
  upsertAttendance,
  importAttendanceReport,
} = require('../controllers/attendanceController.js');

const router = express.Router();
const upload = require('../middleware/upload.js');

router.post('/biometric-webhook', biometricWebhook);
router.use(requireAuth);
router.get('/mine', myAttendance);
router.post('/import-report', requireRole('hr', 'admin'), upload.single('file'), importAttendanceReport);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/', requireRole('hr', 'admin', 'superadmin'), allAttendance);
router.put('/manual', requireRole('hr', 'admin'), upsertAttendance);

module.exports = router;
