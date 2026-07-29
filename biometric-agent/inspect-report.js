const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'attendance-imports', 'processed', 'MnPerformance.xls');
const workbook = XLSX.readFile(filePath, { raw: false, defval: '' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
const rows = [];
for (let r = range.s.r; r <= range.e.r; r += 1) {
  const row = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cellAddress = XLSX.utils.encode_col(c) + XLSX.utils.encode_row(r);
    row.push(sheet[cellAddress]?.v || '');
  }
  rows.push(row);
}

console.log('rows:', rows.length);
for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i];
  const first = String(row[1] || '').toLowerCase();
  const second = String(row[3] || '').toLowerCase();
  if (first.includes('emp') || second.includes('name')) {
    console.log('HEADER', i, JSON.stringify(row.slice(0, 12)));
  }
}

console.log(JSON.stringify(rows.slice(0, 15).map((row) => row.slice(0, 30)), null, 2));
