const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const { listAnnouncements, createAnnouncement, updateAnnouncement } = require('../controllers/announcementController.js');

const router = express.Router();

router.use(requireAuth);
router.get('/', listAnnouncements);
router.post('/', requireRole('hr', 'admin', 'superadmin'), createAnnouncement);
router.put('/:id', requireRole('hr', 'admin', 'superadmin'), updateAnnouncement);

module.exports = router;
