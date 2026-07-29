const express = require('express');
const { login, me, changePassword, updateMe } = require('../controllers/authController.js');
const { requireAuth } = require('../middleware/auth.js');

const router = express.Router();

router.post('/login', login);
router.get('/me', requireAuth, me);
router.put('/me', requireAuth, updateMe);
router.post('/change-password', requireAuth, changePassword);

module.exports = router;
