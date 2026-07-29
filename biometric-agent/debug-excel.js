/**
 * Debug Excel Parser - Shows file structure with column indices
 */

const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'attendance-imports', 'MnPerformance.xls');

try {
  console.log('📖 Reading file...\n');
  const workbook = XLSX.readFile(filePath, { raw: false, defval: '' });
  
  console.log(`📊 Sheets: ${workbook.SheetNames.join(', ')}\n`);

  for (const sheetName of workbook.SheetNames) {
    console.log(`=== Sheet: ${sheetName} ===\n`);
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    
    console.log(`Dimensions: ${range.e.r + 1} rows x ${range.e.c + 1} columns\n`);

    // Show first 20 rows WITH COLUMN INDICES
    for (let R = range.s.r; R < Math.min(range.s.r + 20, range.e.r); R++) {
      const row = [];
      for (let C = range.s.c; C <= Math.min(range.s.c + 10, range.e.c); C++) {
        const cellAddress = XLSX.utils.encode_col(C) + XLSX.utils.encode_row(R);
        const cell = sheet[cellAddress];
        row.push(String(cell?.v || '').substring(0, 12));
      }
      console.log(`R[${R}] (Row ${R+1}):  Col 0: '${row[0]}' | Col 1: '${row[1]}' | Col 2: '${row[2]}' | Col 3: '${row[3]}'`);
    }
  }

} catch (err) {
  console.error('Error:', err.message);
}
