const fs = require('fs');
const path = require('path');
const { Document, Employee } = require('../models/index.js');
const { requireSupabase, DOCS_BUCKET } = require('../config/supabaseStorage.js');

function sanitizeFileName(name) {
  return path.basename(String(name || 'upload').replace(/\\/g, '/')) || 'upload';
}

async function saveUploadedFileToStorage(fileBuffer, fileMeta, options = {}) {
  const storageRoot = options.storageRoot || path.join(__dirname, '..', 'uploads', 'documents');
  const safeName = sanitizeFileName(fileMeta?.originalname || fileMeta?.name || 'upload');
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const targetDir = storageRoot;
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, `${unique}-${safeName}`);
  fs.writeFileSync(targetPath, fileBuffer);
  return targetPath;
}

async function myDocuments(req, res) {
  const docs = await Document.findAll({ where: { employeeId: req.user.id }, order: [['createdAt', 'DESC']] });
  res.json(docs);
}

/** HR/admin: view any employee's documents, or all documents if no employeeId given. */
async function allDocuments(req, res) {
  const { employeeId } = req.query;
  const where = employeeId ? { employeeId } : {};
  const docs = await Document.findAll({ where, order: [['createdAt', 'DESC']] });
  res.json(docs);
}

/** Employees upload their own docs; HR can upload for anyone via employeeId in the body. */
async function uploadDocument(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let targetEmployeeId = req.body.employeeId && ['hr', 'admin'].includes(req.user.role)
    ? req.body.employeeId
    : req.user.id;

  const employee = await Employee.findByPk(targetEmployeeId);
  if (!employee) {
    targetEmployeeId = req.user.id;
  }

  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const storagePath = `${targetEmployeeId}/${unique}-${sanitizeFileName(req.file.originalname)}`;

  let savedPath = storagePath;
  let usedLocalFallback = false;

  try {
    const supabase = requireSupabase();
    const { error: uploadError } = await supabase.storage
      .from(DOCS_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }
  } catch (storageError) {
    savedPath = await saveUploadedFileToStorage(req.file.buffer, req.file, {
      storageRoot: path.join(__dirname, '..', 'uploads', 'documents'),
    });
    usedLocalFallback = true;
  }

  const doc = await Document.create({
    employeeId: targetEmployeeId,
    name: req.body.name || req.file.originalname,
    category: req.body.category || 'Other',
    filePath: usedLocalFallback ? savedPath : storagePath,
    fileSize: req.file.size,
    uploadedBy: ['hr', 'admin'].includes(req.user.role) ? `HR (${req.user.name})` : req.user.name,
  });

  res.status(201).json(doc);
}

async function downloadDocument(req, res) {
  const doc = await Document.findByPk(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const isOwner = doc.employeeId === req.user.id;
  const isHr = ['hr', 'admin'].includes(req.user.role);
  if (!isOwner && !isHr) return res.status(403).json({ error: 'Not authorized to access this document' });

  if (fs.existsSync(doc.filePath)) {
    return res.download(doc.filePath, doc.name);
  }

  const supabase = requireSupabase();
  // Short-lived signed URL — bucket stays private, this backend is still the
  // only thing that decides who's allowed to see a given document.
  const { data, error } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(doc.filePath, 60, { download: doc.name });
  if (error || !data?.signedUrl) return res.status(404).json({ error: 'File missing on server' });

  res.redirect(data.signedUrl);
}

async function deleteDocument(req, res) {
  const doc = await Document.findByPk(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const isHr = ['hr', 'admin'].includes(req.user.role);
  if (!isHr) return res.status(403).json({ error: 'Not authorized to delete this document' });

  if (fs.existsSync(doc.filePath)) {
    fs.unlinkSync(doc.filePath);
  } else {
    const supabase = requireSupabase();
    await supabase.storage.from(DOCS_BUCKET).remove([doc.filePath]);
  }

  await doc.destroy();
  res.json({ ok: true });
}

module.exports = { myDocuments, allDocuments, uploadDocument, downloadDocument, deleteDocument, saveUploadedFileToStorage };
