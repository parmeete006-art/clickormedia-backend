const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const { summary } = require('../controllers/dashboardController.js');

const router = express.Router();

router.use(requireAuth);
router.get('/summary', requireRole('hr', 'admin', 'superadmin'), summary);

module.exports = router;
