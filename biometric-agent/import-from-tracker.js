/**
 * Attendance Tracker Excel Import Tool
 * Reads Excel reports from Attendance Tracker 11.8 and syncs to our backend
 * 
 * Usage:
 * 1. In Attendance Tracker, export report as Excel (.xlsx)
 * 2. Save to: attendance-import-template.xlsx
 * 3. Run: node import-from-tracker.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL;
const WEBHOOK_SECRET = process.env.BIOMETRIC_WEBHOOK_SECRET;
const IMPORT_FILE = path.join(__dirname, 'attendance-import-template.xlsx');

// Mapping: Attendance Tracker column names → our system
const COLUMN_MAPPINGS = {
  'Employee ID': 'employeeId',
  'Emp Code': 'employeeId',
  'User ID': 'employeeId',
  'ID': 'employeeId',
  
  'Check In': 'checkIn',
  'In Time': 'checkIn',
  'Punch In': 'checkIn',
  'In': 'checkIn',
  
  'Check Out': 'checkOut',
  'Out Time': 'checkOut',
  'Punch Out': 'checkOut',
  'Out': 'checkOut',
  
  'Date': 'date',
  'Work Date': 'date',
};

function findColumn(headers, patterns) {
  for (const pattern of patterns) {
    const found = headers.find(h => h.toLowerCase().includes(pattern.toLowerCase()));
    if (found) return found;
  }
  return null;
}

async function importFromExcel() {
  if (!fs.existsSync(IMPORT_FILE)) {
    console.error(`❌ File not found: ${IMPORT_FILE}`);
    console.log('📋 Steps:');
    console.log('1. In Attendance Tracker, go to Reports → Attendance');
    console.log('2. Export as Excel (.xlsx)');
    console.log(`3. Save to: ${IMPORT_FILE}`);
    process.exit(1);
  }

  try {
    console.log(`📖 Reading: ${IMPORT_FILE}`);
    const workbook = XLSX.readFile(IMPORT_FILE);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      console.error('❌ Excel file is empty');
      process.exit(1);
    }

    // Detect column names
    const headers = Object.keys(data[0]);
    console.log(`✓ Found ${data.length} records with columns: ${headers.join(', ')}`);

    // Find our columns
    const employeeIdCol = findColumn(headers, ['Employee', 'Emp', 'User', 'ID']);
    const checkInCol = findColumn(headers, ['Check In', 'In Time', 'Punch In']);
    const checkOutCol = findColumn(headers, ['Check Out', 'Out Time', 'Punch Out']);
    const dateCol = findColumn(headers, ['Date', 'Work Date']);

    if (!employeeIdCol || !dateCol) {
      console.error('❌ Could not find required columns (Employee ID, Date)');
      console.log(`   Available columns: ${headers.join(', ')}`);
      process.exit(1);
    }

    console.log(`\n📊 Detected columns:`);
    console.log(`   Employee ID: ${employeeIdCol}`);
    console.log(`   Date: ${dateCol}`);
    console.log(`   Check In: ${checkInCol || '(not found)'}`);
    console.log(`   Check Out: ${checkOutCol || '(not found)'}`);

    // Process and sync
    let synced = 0;
    let skipped = 0;

    for (const row of data) {
      const employeeId = row[employeeIdCol]?.toString().trim();
      const date = row[dateCol]?.toString().trim();
      const checkIn = row[checkInCol]?.toString().trim();
      const checkOut = row[checkOutCol]?.toString().trim();

      if (!employeeId || !date) {
        skipped++;
        continue;
      }

      try {
        // Map to our biometric user ID (BIO-101, etc.)
        // If the column has numeric values, convert to BIO-XXX format
        const biometricUserId = isNaN(employeeId) ? employeeId : `BIO-${String(employeeId).padStart(3, '0')}`;

        const punchTime = checkIn ? new Date(`${date} ${checkIn}`) : new Date(date);

        await axios.post(`${API_BASE_URL}/attendance/biometric-webhook`, {
          secret: WEBHOOK_SECRET,
          biometricUserId,
          punchTime: punchTime.toISOString(),
          deviceId: 'attendance-tracker-import',
          source: 'attendance-tracker',
        }, { timeout: 5000 });

        synced++;
        console.log(`  ✓ ${employeeId} on ${date}`);
      } catch (err) {
        console.error(`  ✗ ${employeeId}: ${err.response?.data?.error || err.message}`);
      }
    }

    console.log(`\n✅ Import complete: ${synced} synced, ${skipped} skipped`);

  } catch (err) {
    console.error('Error reading Excel file:', err.message);
    console.error('Make sure you have the correct file format');
    process.exit(1);
  }
}

importFromExcel();
