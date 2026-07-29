/**
 * Folder Watcher for Attendance Tracker Excel Imports
 * 
 * Usage:
 * 1. Run: node watch-imports.js
 * 2. Export Excel from Attendance Tracker
 * 3. Save to: attendance-imports/ folder
 * 4. Automatically syncs to app (no manual steps!)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');
const chokidar = require('chokidar');
const XLSX = require('xlsx');
const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL;
const WEBHOOK_SECRET = process.env.BIOMETRIC_WEBHOOK_SECRET;
const WATCH_DIR = path.join(__dirname, 'attendance-imports');

function parseReportBaseDate(sheet) {
  const raw = Object.values(sheet)
    .filter((cell) => cell && typeof cell.v === 'string')
    .map((cell) => cell.v)
    .find((value) => value.toLowerCase().includes('report date from'));

  if (!raw) return null;
  const match = raw.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  return { year: match[3], month: match[2] };
}

// Create watch folder if it doesn't exist
if (!fs.existsSync(WATCH_DIR)) {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
  console.log(`✓ Created folder: ${WATCH_DIR}`);
}

async function processFile(filePath) {
  if (!filePath.endsWith('.xlsx') && !filePath.endsWith('.xls')) {
    return;
  }

  console.log(`\n📖 Processing: ${path.basename(filePath)}`);

  try {
    const workbook = XLSX.readFile(filePath, { raw: false, defval: '' });
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet['!ref']);
      
      // Get raw rows
      const rows = [];
      for (let R = range.s.r; R <= range.e.r; R++) {
        const row = [];
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_col(C) + XLSX.utils.encode_row(R);
          const cell = sheet[cellAddress];
          row.push(cell?.v || '');
        }
        rows.push(row);
      }

      const reportDate = parseReportBaseDate(sheet);
      const baseYear = reportDate?.year || String(new Date().getFullYear());
      const baseMonth = reportDate?.month || String(new Date().getMonth() + 1).padStart(2, '0');

      console.log(`✓ Sheet: ${sheetName}, ${rows.length} rows, report month: ${baseYear}-${baseMonth}`);

      let synced = 0;
      const sentPunches = new Set();

      // Scan all rows looking for employee blocks
      for (let i = 0; i < rows.length - 5; i++) {
        const row = rows[i];
        
        // Check if this row has "EmpCode" header (column 1, not 0 - there's an empty first column)
        const hasEmpCodeHeader = String(row[1] || '').toLowerCase().includes('emp');
        const hasNameHeader = String(row[3] || '').toLowerCase().includes('name');

        if (!hasEmpCodeHeader || !hasNameHeader) continue;

        // Next row should have employee data
        const empRow = rows[i + 1];
        const empCode = String(empRow[1] || '').trim();
        const empName = String(empRow[3] || '').trim();

        if (!empCode) continue;
        if (['Shift', 'Status'].includes(empCode) || empCode.toLowerCase().startsWith('shift') || empCode.toLowerCase().startsWith('status')) continue;

        console.log(`  Found employee: ${empCode} (${empName})`);

        // Look for "Arrived Time" row in next 5 rows
        let arrivedTimeRow = -1;
        for (let j = i + 2; j <= i + 6 && j < rows.length; j++) {
          if (String(rows[j][1] || '').toLowerCase().includes('arrived')) {
            arrivedTimeRow = j;
            break;
          }
        }

        if (arrivedTimeRow === -1) {
          console.log(`    ⚠️  No "Arrived Time" row found`);
          continue;
        }

        // Day numbers are in the row before Arrived Time
        const dayRow = rows[arrivedTimeRow - 1];
        const timeRow = rows[arrivedTimeRow];

        // Extract times for each day (start from column 3, not 2)
        for (let dayCol = 3; dayCol < timeRow.length; dayCol++) {
          const dayNum = String(dayRow[dayCol] || '').trim();
          const timeStr = String(timeRow[dayCol] || '').trim();

          // Check if valid day (01-31) and time (HH:MM format) and not 00:00
          const dayTest = /^0?[1-9]$|^[12][0-9]$|^3[01]$/.test(dayNum);
          const timeTest = /\d{1,2}:\d{2}/.test(timeStr);
          const not00 = timeStr !== '00:00';
          
          if (dayTest && timeTest && not00) {
            const biometricUserId = `BIO-${String(empCode).padStart(3, '0')}`;
            const day = dayNum.padStart(2, '0');
            const dateStr = `${baseYear}-${baseMonth}-${day}`;
            const key = `${biometricUserId}|${dateStr}|${timeStr}`;
            if (sentPunches.has(key)) {
              console.log(`    ⚠️  Duplicate punch skipped for ${empName} ${dateStr} ${timeStr}`);
              continue;
            }
            sentPunches.add(key);

            try {
              const punchTime = new Date(`${dateStr}T${timeStr}:00`);

              await axios.post(`${API_BASE_URL}/attendance/biometric-webhook`, {
                secret: WEBHOOK_SECRET,
                biometricUserId,
                employeeName: empName,
                punchTime: punchTime.toISOString(),
                deviceId: 'attendance-tracker-import',
              }, { timeout: 5000 });

              synced++;
              console.log(`    ✓ ${empName} (${biometricUserId}) ${dateStr} ${timeStr}`);
            } catch (err) {
              const responseError = err.response?.data?.error || err.response?.data || err.message;
              console.error(`    ✗ ${empName} (${biometricUserId}) ${dayNum}: ${responseError}`);
            }
          }
        }
      }

      if (synced > 0) {
        console.log(`\n✅ Sheet "${sheetName}": Synced ${synced} punch records`);

        // Move file to processed folder
        const processedDir = path.join(WATCH_DIR, 'processed');
        if (!fs.existsSync(processedDir)) {
          fs.mkdirSync(processedDir, { recursive: true });
        }
        const newPath = path.join(processedDir, path.basename(filePath));
        try {
          fs.renameSync(filePath, newPath);
          console.log(`📦 Archived: processed/${path.basename(filePath)}`);
        } catch (err) {
          console.log(`⚠️  Could not move file (still in use)`);
        }
        return;
      }
    }

    console.error('❌ No data found in file');

  } catch (err) {
    console.error('Error processing file:', err.message);
  }
}

console.log(`\n👁️  Folder watcher started`);
console.log(`📁 Watching: ${WATCH_DIR}`);
console.log(`\n💡 Steps:`);
console.log(`   1. In Attendance Tracker, export as Excel (.xlsx)`);
console.log(`   2. Save to: ${WATCH_DIR}`);
console.log(`   3. File automatically syncs (no manual steps!)\n`);

const watcher = chokidar.watch(WATCH_DIR, {
  ignored: (path) => path.includes('processed'),
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
});

watcher.on('add', (filePath) => {
  if (!filePath.includes('processed')) {
    processFile(filePath);
  }
});

watcher.on('error', (error) => {
  console.error('Watcher error:', error);
});
