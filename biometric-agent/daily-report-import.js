require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { processExcelFile } = require('./report-importer');

const IMPORT_DIR = path.join(__dirname, 'attendance-imports');
const PROCESSED_DIR = path.join(IMPORT_DIR, 'processed');
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const WEBHOOK_SECRET = process.env.BIOMETRIC_WEBHOOK_SECRET;
const REPORT_IMPORT_ENABLED = String(process.env.REPORT_IMPORT_ENABLED || 'true').toLowerCase() === 'true';
const INTERVAL_MS = Number(process.env.REPORT_IMPORT_INTERVAL_MS || 86400000);

if (!REPORT_IMPORT_ENABLED) {
  console.log('Daily report import is disabled.');
  process.exit(0);
}

if (!fs.existsSync(IMPORT_DIR)) {
  fs.mkdirSync(IMPORT_DIR, { recursive: true });
}
if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

async function fetchReportFromTracker() {
  const exportUrl = process.env.TRACKER_EXPORT_URL;
  if (!exportUrl) {
    console.log('No TRACKER_EXPORT_URL configured; skipping remote fetch.');
    return null;
  }

  const authType = process.env.TRACKER_EXPORT_AUTH_TYPE;
  const apiKey = process.env.TRACKER_EXPORT_API_KEY;
  const apiKeyHeader = process.env.TRACKER_EXPORT_API_KEY_HEADER || 'Authorization';
  const username = process.env.TRACKER_EXPORT_USERNAME;
  const password = process.env.TRACKER_EXPORT_PASSWORD;

  const config = { responseType: 'arraybuffer', timeout: 30000, headers: {} };
  if (authType === 'bearer' && apiKey) {
    config.headers[apiKeyHeader] = `Bearer ${apiKey}`;
  } else if (authType === 'header' && apiKey) {
    config.headers[apiKeyHeader] = apiKey;
  } else if (authType === 'basic' && username && password) {
    config.auth = { username, password };
  }

  try {
    const response = await axios.get(exportUrl, config);
    const ext = path.extname(new URL(exportUrl).pathname).toLowerCase() || '.xlsx';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(IMPORT_DIR, `attendance-report-${timestamp}${ext}`);
    fs.writeFileSync(filePath, response.data);
    return filePath;
  } catch (err) {
    console.error('Failed to fetch tracker report:', err.message);
    return null;
  }
}

async function runImport() {
  try {
    let files = [];
    if (fs.existsSync(IMPORT_DIR)) {
      files = fs.readdirSync(IMPORT_DIR)
        .filter((name) => !name.includes('processed'))
        .map((name) => path.join(IMPORT_DIR, name))
        .filter((filePath) => fs.statSync(filePath).isFile() && (path.extname(filePath).toLowerCase() === '.xlsx' || path.extname(filePath).toLowerCase() === '.xls'));
    }

    const fetchedFile = await fetchReportFromTracker();
    if (fetchedFile) files.push(fetchedFile);

    if (files.length === 0) {
      console.log('No daily report files found to import.');
      return;
    }

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      console.log(`Processing daily report: ${path.basename(filePath)}`);
      await processExcelFile(filePath, {
        apiBaseUrl: API_BASE_URL,
        webhookSecret: WEBHOOK_SECRET,
        deviceId: 'attendance-tracker-import',
        processedDir: PROCESSED_DIR,
      });
    }
  } catch (err) {
    console.error('Daily report import failed:', err.message);
  }
}

async function main() {
  await runImport();
  if (INTERVAL_MS > 0) {
    console.log(`Daily report importer will run every ${INTERVAL_MS / 1000 / 60} minute(s).`);
    setInterval(runImport, INTERVAL_MS);
  }
}

main();
