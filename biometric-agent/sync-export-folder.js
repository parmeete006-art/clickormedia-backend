require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

function resolveFolder(folder) {
  if (!folder) {
    return path.join(__dirname, 'attendance-imports');
  }
  if (path.isAbsolute(folder)) {
    return folder;
  }
  return path.resolve(__dirname, folder);
}

const SOURCE_DIR = resolveFolder(process.env.TRACKER_EXPORT_FOLDER);
const TARGET_DIR = path.join(__dirname, 'attendance-imports');
const POLL_INTERVAL_MS = Number(process.env.TRACKER_EXPORT_POLL_INTERVAL_MS || 10000);

if (!fs.existsSync(SOURCE_DIR)) {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  console.log(`✓ Created source folder: ${SOURCE_DIR}`);
}

if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

function isExcelFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.xlsx' || ext === '.xls';
}

function getTargetPath(filePath) {
  const name = path.basename(filePath);
  const targetPath = path.join(TARGET_DIR, name);
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(TARGET_DIR, `${path.basename(name, path.extname(name))}-${timestamp}${path.extname(name)}`);
}

function copyFile(filePath) {
  if (!isExcelFile(filePath)) return;

  const targetPath = getTargetPath(filePath);
  fs.copyFile(filePath, targetPath, (err) => {
    if (err) {
      console.error(`✗ Failed to copy ${filePath}:`, err.message);
      return;
    }
    console.log(`✓ Copied ${path.basename(filePath)} → ${targetPath}`);
  });
}

function scanExistingFiles() {
  const entries = fs.readdirSync(SOURCE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const sourcePath = path.join(SOURCE_DIR, entry.name);
    if (isExcelFile(sourcePath)) {
      copyFile(sourcePath);
    }
  }
}

console.log(`Watching Attendance Tracker export folder: ${SOURCE_DIR}`);
console.log(`Copying Excel exports into: ${TARGET_DIR}`);

scanExistingFiles();

const watcher = chokidar.watch(SOURCE_DIR, {
  ignored: /(^|[\/\\])\../,
  depth: 0,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
});

watcher.on('add', (filePath) => {
  if (isExcelFile(filePath)) {
    console.log(`Detected new export: ${filePath}`);
    copyFile(filePath);
  }
});

watcher.on('change', (filePath) => {
  if (isExcelFile(filePath)) {
    console.log(`Detected updated export: ${filePath}`);
    copyFile(filePath);
  }
});

watcher.on('error', (error) => {
  console.error('Watcher error:', error.message);
});

if (POLL_INTERVAL_MS > 0) {
  setInterval(scanExistingFiles, POLL_INTERVAL_MS);
}
