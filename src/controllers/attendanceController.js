const fs = require('fs');
const path = require('path');
const { Op, fn, col, where } = require('sequelize');
const { Attendance, Employee, sequelize } = require('../models/index.js');
const XLSX = require('xlsx');
const { buildAttendanceImportPayload } = require('../utils/attendanceImport.js');

function toDateKey(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getAttendanceStatus(checkIn, checkOut) {
  if (!checkIn) return 'Absent';

  const arrival = new Date(checkIn);
  const lateThreshold = new Date(arrival);
  lateThreshold.setHours(10, 15, 0, 0);

  const leaveThreshold = new Date(arrival);
  leaveThreshold.setHours(17, 30, 0, 0);

  if (checkOut) {
    const departure = new Date(checkOut);
    if (departure <= arrival) {
      return arrival > lateThreshold ? 'Late' : 'Present';
    }
    if (departure < leaveThreshold) return arrival > lateThreshold ? 'Late' : 'Present';
  }

  return arrival > lateThreshold ? 'Late' : 'Present';
}

async function syncAttendanceSequence() {
  try {
    await sequelize.query(`
      SELECT setval(
        pg_get_serial_sequence('attendance', 'id'),
        COALESCE((SELECT MAX(id) FROM attendance), 0) + 1,
        false
      );
    `);
  } catch (error) {
    console.warn('Unable to sync attendance sequence:', error.message);
  }
}

async function getNextAttendanceId() {
  const [rows] = await sequelize.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM attendance');
  return Number(rows[0]?.next_id || 1);
}

async function findOrCreateAttendanceRow(employeeId, date, defaults) {
  const existing = await Attendance.findOne({ where: { employeeId, date } });
  if (existing) return [existing, false];

  try {
    return await Attendance.findOrCreate({
      where: { employeeId, date },
      defaults,
    });
  } catch (error) {
    const isUniqueConstraint = error?.name === 'SequelizeUniqueConstraintError';
    if (!isUniqueConstraint) throw error;

    await syncAttendanceSequence();
    const existingAfter = await Attendance.findOne({ where: { employeeId, date } });
    if (existingAfter) return [existingAfter, false];

    const nextId = await getNextAttendanceId();
    return [await Attendance.create({ ...defaults, id: nextId }), true];
  }
}

async function myAttendance(req, res) {
  const { month, year } = req.query;
  const where = { employeeId: req.user.id };
  if (month && year) {
    const mNum = Number(month);
    let monthIndex = null;
    if (!Number.isNaN(mNum)) {
      if (mNum >= 0 && mNum <= 11) monthIndex = mNum;
      else if (mNum >= 1 && mNum <= 12) monthIndex = mNum - 1;
    }
    if (monthIndex !== null) {
      const monthStr = String(monthIndex + 1).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-${new Date(Number(year), monthIndex + 1, 0).getDate().toString().padStart(2, '0')}`;
      where.date = { [Op.gte]: startDate, [Op.lte]: endDate };
    } else {
      const monthStr = String(month).padStart(2, '0');
      where.date = { [Op.like]: `${year}-${monthStr}-%` };
    }
  }
  const rows = await Attendance.findAll({ where, order: [['date', 'DESC']] });
  res.json(rows);
}

async function checkIn(req, res) {
  const now = new Date();
  const date = toDateKey(now);
  const [row] = await findOrCreateAttendanceRow(req.user.id, date, {
    employeeId: req.user.id,
    date,
    checkIn: now,
    status: getAttendanceStatus(now, null),
    source: 'manual',
  });
  if (!row.checkIn) {
    await row.update({ checkIn: now, status: getAttendanceStatus(now, row.checkOut), source: 'manual' });
  }
  res.json(row);
}

async function checkOut(req, res) {
  const now = new Date();
  const date = toDateKey(now);
  const row = await Attendance.findOne({ where: { employeeId: req.user.id, date } });
  if (!row) return res.status(400).json({ error: 'Check in before checking out' });
  await row.update({ checkOut: now, status: getAttendanceStatus(row.checkIn, now) });
  res.json(row);
}

/** HR/admin: view attendance across everyone, optionally filtered by date or employee. */
async function allAttendance(req, res) {
  const { date, employeeId } = req.query;
  const where = {};
  if (date) where.date = date;
  if (employeeId) where.employeeId = employeeId;

  const rows = await Attendance.findAll({
    where,
    include: [{ model: Employee, attributes: ['id', 'name', 'department'] }],
    order: [['date', 'DESC']],
    limit: 500,
  });
  res.json(rows);
}

/**
 * Called by the on-prem biometric agent (see /biometric-agent), never by
 * the phone app directly. Protected by a shared secret, not a user JWT,
 * since the office device has no employee login of its own.
 */
async function biometricWebhook(req, res) {
  const { secret, biometricUserId, employeeName, punchTime, date: dateOverride, status, deviceId } = req.body;
  if (secret !== process.env.BIOMETRIC_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  if (!biometricUserId) {
    return res.status(400).json({ error: 'biometricUserId is required' });
  }

  let employee = await Employee.findOne({ where: { biometricUserId } });
  if (!employee && employeeName) {
    employee = await Employee.findOne({
      where: where(fn('lower', col('name')), employeeName.toLowerCase()),
    });
  }
  if (!employee) {
    return res.status(404).json({ error: `No employee mapped to biometric ID ${biometricUserId}` });
  }

  const parsedStatus = status ? String(status).trim() : null;
  const date = dateOverride ? String(dateOverride) : punchTime ? toDateKey(new Date(punchTime)) : null;
  if (!date) {
    return res.status(400).json({ error: 'date or punchTime is required' });
  }

  if (!punchTime) {
    if (!parsedStatus || parsedStatus === 'Present' || parsedStatus === 'Late') {
      return res.status(400).json({ error: 'punchTime is required for present or late punches' });
    }

    const [row] = await findOrCreateAttendanceRow(employee.id, date, {
      employeeId: employee.id,
      date,
      status: parsedStatus,
      source: 'attendance-tracker-import',
    });

    if (row.status !== parsedStatus || row.checkIn || row.checkOut) {
      await row.update({
        status: parsedStatus,
        checkIn: null,
        checkOut: null,
        source: 'attendance-tracker-import',
      });
    }

    return res.json({ ok: true, employeeId: employee.id, date, status: parsedStatus, deviceId });
  }

  const punch = new Date(punchTime);
  const punchDate = toDateKey(punch);
  const [row] = await findOrCreateAttendanceRow(employee.id, punchDate, {
    employeeId: employee.id,
    date: punchDate,
    checkIn: punch,
    status: getAttendanceStatus(punch, null),
    source: 'attendance-tracker-import',
  });

  const punchMs = punch.getTime();
  const checkInMs = row.checkIn ? new Date(row.checkIn).getTime() : null;
  const checkOutMs = row.checkOut ? new Date(row.checkOut).getTime() : null;

  if (!row.checkIn) {
    await row.update({ checkIn: punch, status: getAttendanceStatus(punch, row.checkOut), source: 'attendance-tracker-import' });
  } else if (checkOutMs) {
    return res.json({ ok: true, ignored: true, message: 'Duplicate punch ignored' });
  } else if (checkInMs !== null && punchMs <= checkInMs) {
    return res.json({ ok: true, ignored: true, message: 'Duplicate or earlier punch ignored' });
  } else {
    await row.update({ checkOut: punch, status: getAttendanceStatus(row.checkIn, punch) });
  }

  res.json({ ok: true, employeeId: employee.id, date: punchDate, deviceId });
}

/**
 * HR/admin: manually set or correct an attendance record — e.g. the
 * biometric device missed a punch, or someone forgot to check out.
 */
async function upsertAttendance(req, res) {
  const { employeeId, date, status, checkIn, checkOut } = req.body;
  if (!employeeId || !date || !status) {
    return res.status(400).json({ error: 'employeeId, date, and status are required' });
  }

  const [row] = await findOrCreateAttendanceRow(employeeId, date, {
    employeeId,
    date,
    status,
    source: 'admin',
  });

  await row.update({
    status,
    checkIn: checkIn ? new Date(checkIn) : row.checkIn,
    checkOut: checkOut ? new Date(checkOut) : row.checkOut,
    source: 'admin',
  });

  res.json(row);
}

function parseReportBaseDate(sheet) {
  const raw = Object.values(sheet)
    .filter((cell) => cell && typeof cell.v === 'string')
    .map((cell) => cell.v)
    .find((value) => value.toLowerCase().includes('report date from'));

  if (!raw) return null;
  const matches = raw.match(/(\d{2})-(\d{2})-(\d{4})/g) || [];
  if (matches.length < 2) return null;
  const [startDate] = matches;
  const [, , month, year] = startDate.match(/(\d{2})-(\d{2})-(\d{4})/) || [];
  return { year, month };
}

function getDateFromExcelRow(dayRow, timeRow, dayCol, baseYear, baseMonth) {
  const dayNum = String(dayRow[dayCol] || '').trim();
  if (!dayNum || !/^0?[1-9]$|^[12][0-9]$|^3[01]$/.test(dayNum)) return null;
  const day = dayNum.padStart(2, '0');
  const date = `${baseYear}-${String(baseMonth).padStart(2, '0')}-${day}`;
  return { date, timeStr: String(timeRow[dayCol] || '').trim() };
}

async function importAttendanceReport(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Uploaded file not found' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.xls' && ext !== '.xlsx') {
    return res.status(400).json({ error: 'Only Excel files are supported' });
  }

  try {
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

    const reportDate = parseReportBaseDate(sheet) || { year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1).padStart(2, '0') };
    const baseYear = reportDate.year;
    const baseMonth = reportDate.month;
    let imported = 0;
    const processed = new Set();

    const employeeStartRow = rows.findIndex((row) => String(row[3] || '').includes('Sr.No'));
    if (employeeStartRow === -1) {
      return res.status(400).json({ error: 'This Excel report format is not supported yet' });
    }

    for (let i = employeeStartRow + 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || !row.some((value) => value !== '')) continue;

      const empCode = String(row[6] || '').trim();
      const empName = String(row[9] || '').trim();
      const arrTime = String(row[15] || '').trim();
      const statusCode = String(row[24] || '').trim();

      if (!empCode && !empName) continue;
      if (!empCode || !arrTime) continue;

      const parsedDate = `${baseYear}-${String(baseMonth).padStart(2, '0')}-${String(reportDate.startDay || 1).padStart(2, '0')}`;
      const date = parsedDate;
      const dayNum = Number(parsedDate.split('-')[2]);
      const key = `${empCode}|${date}|${arrTime}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const biometricUserId = `BIO-${String(empCode).padStart(3, '0')}`;
      let employee = await Employee.findOne({ where: { biometricUserId } });
      if (!employee && empName) {
        employee = await Employee.findOne({ where: { name: empName } });
      }
      if (!employee) continue;

      const payload = buildAttendanceImportPayload({
        date,
        dayNum,
        timeStr: arrTime,
        empName,
        empCode,
      });

      if (statusCode && statusCode.toUpperCase() === 'A') {
        payload.status = 'Absent';
        payload.checkIn = null;
        payload.checkOut = null;
      }

      const [rowRecord] = await Attendance.findOrCreate({
        where: { employeeId: employee.id, date: payload.date },
        defaults: {
          employeeId: employee.id,
          date: payload.date,
          status: payload.status,
          source: 'attendance-tracker-import',
        },
      });

      await rowRecord.update({
        status: payload.status,
        checkIn: payload.checkIn ? new Date(payload.checkIn) : null,
        checkOut: payload.checkOut ? new Date(payload.checkOut) : null,
        source: 'attendance-tracker-import',
      });
      imported += 1;
    }

    res.json({ ok: true, imported, file: req.file.originalname });
  } catch (err) {
    console.error('Import attendance report failed:', err);
    res.status(500).json({ error: err.message || 'Failed to import Excel report' });
  }
}

module.exports = { myAttendance, checkIn, checkOut, allAttendance, biometricWebhook, upsertAttendance, importAttendanceReport };
