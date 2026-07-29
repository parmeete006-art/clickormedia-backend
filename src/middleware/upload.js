const multer = require('multer');

// Files are held in memory just long enough to be forwarded to Supabase
// Storage (see documentController.js) — nothing is written to local disk,
// which matters because Render's free tier doesn't persist local files
// across restarts/redeploys.
const storage = multer.memoryStorage();

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB cap

module.exports = upload;
