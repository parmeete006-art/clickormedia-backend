const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const axios = require('axios');

function isExcelFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.xlsx' || ext === '.xls';
}

function parseReportBaseDate(sheet) {
  const raw = Object.values(sheet)
    .filter((cell) => cell && typeof cell.v === 'string')
    .map((cell) => cell.v)
    .find((value) => value.toLowerCase().includes('report date from'));

  if (!raw) return null;
  const matches = raw.match(/(\d{2})-(\d{2})-(\d{4})/g) || [];
  if (matches.length < 2) return null;
  const [startDate, endDate] = matches;
  const [, startDay, startMonth, startYear] = startDate.match(/(\d{2})-(\d{2})-(\d{4})/) || [];
  const [, endDay, endMonth, endYear] = endDate.match(/(\d{2})-(\d{2})-(\d{4})/) || [];
  return {
    year: startYear || endYear,
    month: startMonth || endMonth,
    startDay: Number(startDay || 1),
    endDay: Number(endDay || 31),
  };
}

function readRowsFromWorkbook(filePath) {
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

  return { rows, sheet, reportDate: parseReportBaseDate(sheet) };
}

async function processExcelFile(filePath, options = {}) {
  if (!isExcelFile(filePath)) {
    return { ok: false, reason: 'not-excel' };
  }

  const {
    apiBaseUrl,
    webhookSecret,
    deviceId = 'attendance-tracker-import',
    processedDir = null,
  } = options;

  if (!apiBaseUrl || !webhookSecret) {
    return { ok: false, reason: 'missing-config' };
  }

  const { rows, reportDate } = readRowsFromWorkbook(filePath);
  const baseYear = reportDate?.year || String(new Date().getFullYear());
  const baseMonth = reportDate?.month || String(new Date().getMonth() + 1).padStart(2, '0');
  const month = String(baseMonth).padStart(2, '0');

  let synced = 0;
  const sentPunches = new Set();

  for (let i = 0; i < rows.length - 5; i += 1) {
    const row = rows[i];
    const hasEmpCodeHeader = String(row[1] || '').toLowerCase().includes('emp');
    const hasNameHeader = String(row[3] || '').toLowerCase().includes('name');

    if (!hasEmpCodeHeader || !hasNameHeader) continue;

    const empRow = rows[i + 1];
    const empCode = String(empRow[1] || '').trim();
    const empName = String(empRow[3] || '').trim();

    if (!empCode) continue;
    if (['Shift', 'Status'].includes(empCode) || empCode.toLowerCase().startsWith('shift') || empCode.toLowerCase().startsWith('status')) continue;

    let arrivedTimeRow = -1;
    for (let j = i + 2; j <= i + 6 && j < rows.length; j += 1) {
      if (String(rows[j][1] || '').toLowerCase().includes('arrived')) {
        arrivedTimeRow = j;
        break;
      }
    }

    if (arrivedTimeRow === -1) continue;

    const dayRow = rows[arrivedTimeRow - 1];
    const timeRow = rows[arrivedTimeRow];

    for (let dayCol = 3; dayCol < timeRow.length; dayCol += 1) {
      const dayNum = String(dayRow[dayCol] || '').trim();
      const timeStr = String(timeRow[dayCol] || '').trim();

      if (!dayNum) continue;

      const dayTest = /^0?[1-9]$|^[12][0-9]$|^3[01]$/.test(dayNum);
      if (!dayTest) continue;

      const biometricUserId = `BIO-${String(empCode).padStart(3, '0')}`;
      const day = dayNum.padStart(2, '0');
      const dateStr = `${baseYear}-${month}-${day}`;
      const normalizedName = String(empName || '').trim().toLowerCase();
      const isSunday = new Date(`${dateStr}T00:00:00`).getDay() === 0;
      const isDaySix = Number(day) === 6;

      let payload = {
        secret: webhookSecret,
        biometricUserId,
        employeeName: empName,
        date: dateStr,
        deviceId,
      };

      if (isSunday) {
        payload.status = 'Holiday';
      } else if (isDaySix) {
        if (normalizedName.includes('kartik')) {
          payload.status = 'Absent';
        } else {
          payload.status = 'Present';
          payload.punchTime = new Date(`${dateStr}T09:00:00`).toISOString();
        }
      } else {
        const timeTest = /\d{1,2}:\d{2}/.test(timeStr);
        const not00 = timeStr !== '00:00';
        if (!timeTest || !not00) continue;
        payload.punchTime = new Date(`${dateStr}T${timeStr}:00`).toISOString();
      }

      const key = `${biometricUserId}|${dateStr}|${isSunday ? 'holiday' : isDaySix ? 'date6' : timeStr}`;
      if (sentPunches.has(key)) continue;
      sentPunches.add(key);

      try {
        await axios.post(`${apiBaseUrl}/attendance/biometric-webhook`, payload, { timeout: 5000 });
        synced += 1;
      } catch (err) {
        console.error(`✗ Failed for ${empName} (${biometricUserId}) on ${dateStr}: ${err.response?.data?.error || err.message}`);
      }
    }
  }

  if (processedDir) {
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }
    const targetPath = path.join(processedDir, path.basename(filePath));
    try {
      fs.renameSync(filePath, targetPath);
    } catch (err) {
      console.log(`⚠️ Could not archive ${path.basename(filePath)}: ${err.message}`);
    }
  }

  return { ok: true, synced, filePath };
}

module.exports = { isExcelFile, processExcelFile };
