const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'clickormedia.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('DB ERR', err);
    process.exit(1);
  }
});
const date = '2026-07-17';
const sql = `SELECT id, employeeId, date, status, checkIn, checkOut, source FROM Attendance WHERE date = ? ORDER BY employeeId`;
db.all(sql, [date], (err, rows) => {
  if (err) {
    console.error('SQL ERR', err);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
