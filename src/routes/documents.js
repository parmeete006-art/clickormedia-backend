const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const upload = require('../middleware/upload.js');
const {
  myDocuments, allDocuments, uploadDocument, downloadDocument, deleteDocument,
} = require('../controllers/documentController.js');

const router = express.Router();

router.use(requireAuth);
router.get('/mine', myDocuments);
router.get('/', requireRole('hr', 'admin', 'superadmin'), allDocuments);
router.post('/', upload.single('file'), uploadDocument);
router.get('/:id/download', downloadDocument);
router.delete('/:id', deleteDocument);

module.exports = router;
