/**
 * Simple test - Read and parse the file directly
 */

const XLSX = require('xlsx');
const path = require('path');

const filePath = 'c:\\Users\\admin\\Desktop\\clickor-media-app\\backend\\biometric-agent\\attendance-imports\\MnPerformance.xls';

console.log('📖 Reading file: ' + filePath);
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['MnPerformance'];
const range = XLSX.utils.decode_range(sheet['!ref']);

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

console.log(`Total rows: ${rows.length}`);

// Show first 20 rows for debugging
console.log('\n📋 First 20 rows:');
for (let i = 0; i < Math.min(20, rows.length); i++) {
  const rowStr = rows[i].slice(0, 5).map(v => `"${String(v).substring(0, 12)}"`).join(' | ');
  console.log(`Row ${i}: ${rowStr}`);
}
console.log('');

// Try to find employees
let found = 0;
for (let i = 0; i < rows.length - 5; i++) {
  const col1 = String(rows[i][1]).toLowerCase();
  const col3 = String(rows[i][3]).toLowerCase();
  
  if (col1.includes('emp') && col3.includes('name')) {
    
    const empCode = String(rows[i+1][1]).trim();
    const empName = String(rows[i+1][3]).trim();
    
    console.log(`✓ Row ${i}: Found employee ${empCode} (${empName}) [${col1}] [${col3}]`);
    
    // Look for "Arrived" row
    for (let j = i+2; j <= i+6; j++) {
      if (String(rows[j][1]).toLowerCase().includes('arrived')) {
        console.log(`  ✓ Arrived row at ${j}`);
        
        const dayRow = rows[j-1];
        const timeRow = rows[j];
        
        // Extract times
        for (let dayCol = 3; dayCol < 20; dayCol++) {
          const dayNum = String(dayRow[dayCol]).trim();
          const timeStr = String(timeRow[dayCol]).trim();
          
          if (/^0?[1-9]$|^[12][0-9]$|^3[01]$/.test(dayNum) && 
              /\d{1,2}:\d{2}/.test(timeStr) && 
              timeStr !== '00:00') {
            console.log(`    ✓ Day ${dayNum}: ${timeStr}`);
            found++;
          }
        }
        break;
      }
    }
  }
}

console.log(`\n✅ Found ${found} punch records`);
