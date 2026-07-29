require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const EXPORT_URL = process.env.TRACKER_EXPORT_URL;
const AUTH_TYPE = process.env.TRACKER_EXPORT_AUTH_TYPE;
const API_KEY = process.env.TRACKER_EXPORT_API_KEY;
const API_KEY_HEADER = process.env.TRACKER_EXPORT_API_KEY_HEADER || 'Authorization';
const USERNAME = process.env.TRACKER_EXPORT_USERNAME;
const PASSWORD = process.env.TRACKER_EXPORT_PASSWORD;
const POLL_INTERVAL_MS = Number(process.env.TRACKER_FETCH_INTERVAL_MS || 0);
const IMPORT_DIR = path.join(__dirname, 'attendance-imports');

if (!EXPORT_URL) {
  console.error('Missing TRACKER_EXPORT_URL in biometric-agent/.env');
  process.exit(1);
}

if (!fs.existsSync(IMPORT_DIR)) {
  fs.mkdirSync(IMPORT_DIR, { recursive: true });
}

function buildAxiosConfig() {
  const config = { responseType: 'arraybuffer', timeout: 30000, headers: {} };

  if (AUTH_TYPE === 'bearer' && API_KEY) {
    config.headers[API_KEY_HEADER] = `Bearer ${API_KEY}`;
  } else if (AUTH_TYPE === 'header' && API_KEY) {
    config.headers[API_KEY_HEADER] = API_KEY;
  } else if (AUTH_TYPE === 'basic' && USERNAME && PASSWORD) {
    config.auth = { username: USERNAME, password: PASSWORD };
  }

  return config;
}

function getOutputFileName(url) {
  const urlExt = path.extname(new URL(url).pathname).toLowerCase();
  const ext = ['.xlsx', '.xls'].includes(urlExt) ? urlExt : '.xlsx';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `attendance-tracker-${timestamp}${ext}`;
}

async function fetchReport() {
  try {
    console.log(`[${new Date().toISOString()}] Fetching attendance report from tracker...`);
    const response = await axios.get(EXPORT_URL, buildAxiosConfig());

    if (response.status !== 200) {
      throw new Error(`Unexpected status ${response.status}`);
    }

    const filename = getOutputFileName(EXPORT_URL);
    const filePath = path.join(IMPORT_DIR, filename);

    fs.writeFileSync(filePath, response.data);
    console.log(`✓ Saved report to ${filePath}`);

    return filePath;
  } catch (err) {
    console.error('✗ Failed to fetch attendance report:', err.message);
    return null;
  }
}

async function main() {
  await fetchReport();

  if (POLL_INTERVAL_MS > 0) {
    console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s and saving files into ${IMPORT_DIR}`);
    setInterval(fetchReport, POLL_INTERVAL_MS);
  }
}

main();
