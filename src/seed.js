require('dotenv').config();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { syncDatabase, Employee, AuthUser, SalaryStructure, Attendance } = require('./models/index.js');

const JSON_EMPLOYEES_FILE = path.join(__dirname, 'employee-data.json');
const EXCEL_EMPLOYEES_FILE = path.join(__dirname, '../biometric-agent/attendance-imports/MnPerformance.xls');

function normalizeEmail(name) {
  const local = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '.');
  return `${local || 'employee'}@clickormedia.com`;
}

function normalizeEmployeeId(code) {
  const raw = String(code).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) {
    return `EMP-${String(numeric).padStart(4, '0')}`;
  }
  return `EMP-${raw.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase()}`;
}

function loadEmployeesFromJson() {
  if (!fs.existsSync(JSON_EMPLOYEES_FILE)) return null;
  const data = JSON.parse(fs.readFileSync(JSON_EMPLOYEES_FILE, 'utf8'));
  if (!Array.isArray(data) || data.length === 0) return null;
  return data.map((employee) => ({
    id: employee.id || normalizeEmployeeId(employee.empCode || employee.employeeId || employee.name),
    name: employee.name || 'Unnamed Employee',
    email: employee.email || normalizeEmail(employee.name || employee.id),
    department: employee.department || 'General',
    designation: employee.designation || 'Employee',
    biometricUserId: employee.biometricUserId || (typeof employee.empCode !== 'undefined' ? `BIO-${String(employee.empCode).padStart(3, '0')}` : undefined),
    phone: employee.phone,
    joinDate: employee.joinDate,
    managerName: employee.managerName,
    bankName: employee.bankName,
    bankAccountNumber: employee.bankAccountNumber,
    bankIfsc: employee.bankIfsc,
  }));
}

function loadEmployeesFromExcel() {
  if (!fs.existsSync(EXCEL_EMPLOYEES_FILE)) return null;
  const workbook = XLSX.readFile(EXCEL_EMPLOYEES_FILE, { raw: false, defval: '' });
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

  const employees = [];
  const seen = new Set();

  for (let i = 0; i < rows.length - 1; i += 1) {
    const headerRow = rows[i];
    const nextRow = rows[i + 1];
    const hasEmpCodeHeader = String(headerRow[1] || '').toLowerCase().includes('empcode');
    const hasNameHeader = String(headerRow[3] || '').toLowerCase().includes('name');
    if (!hasEmpCodeHeader || !hasNameHeader) continue;

    const empCode = String(nextRow[1] || '').trim();
    const name = String(nextRow[3] || '').trim();
    if (!empCode || !name) continue;

    const id = normalizeEmployeeId(empCode);
    if (seen.has(id)) continue;
    seen.add(id);

    employees.push({
      id,
      name,
      email: normalizeEmail(name),
      department: 'General',
      designation: 'Employee',
      biometricUserId: `BIO-${String(empCode).padStart(3, '0')}`,
    });
  }

  return employees.length > 0 ? employees : null;
}

function parseReportBaseDate(sheet) {
  const text = Object.values(sheet)
    .filter((cell) => typeof cell.v === 'string')
    .map((cell) => cell.v)
    .find((value) => value.toLowerCase().includes('report date from'));
  if (!text) return null;
  const matches = text.match(/(\d{2})-(\d{2})-(\d{4})/g);
  if (!matches || matches.length === 0) return null;
  const [day, month, year] = matches[0].split('-');
  return { year, month };
}

function isLate(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return h > 10 || (h === 10 && m > 15);
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
    if (departure < leaveThreshold) return 'Absent';
  }

  return arrival > lateThreshold ? 'Late' : 'Present';
}

function loadAttendanceFromExcel() {
  if (!fs.existsSync(EXCEL_EMPLOYEES_FILE)) return [];
  const workbook = XLSX.readFile(EXCEL_EMPLOYEES_FILE, { raw: false, defval: '' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const baseDate = parseReportBaseDate(sheet) || { year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1).padStart(2, '0') };
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

  const attendance = [];
  const seen = new Set();

  for (let i = 0; i < rows.length - 1; i += 1) {
    const headerRow = rows[i];
    const dataRow = rows[i + 1];
    const hasEmpCodeHeader = String(headerRow[1] || '').toLowerCase().includes('empcode');
    const hasNameHeader = String(headerRow[3] || '').toLowerCase().includes('name');
    if (!hasEmpCodeHeader || !hasNameHeader) continue;

    const empCode = String(dataRow[1] || '').trim();
    const name = String(dataRow[3] || '').trim();
    if (!empCode || !name) continue;

    const employeeKey = `${empCode}:${name}`;
    if (seen.has(employeeKey)) continue;
    seen.add(employeeKey);

    let arrivedTimeRow = -1;
    let departTimeRow = -1;
    for (let j = i + 2; j <= i + 10 && j < rows.length; j += 1) {
      const label = String(rows[j][1] || '').toLowerCase();
      if (label.includes('arrived')) arrivedTimeRow = j;
      if (label.includes('dept.time') || label.includes('dept.time') || label.includes('dept') || label.includes('dept.')) departTimeRow = j;
    }
    if (arrivedTimeRow === -1) continue;

    const dayRow = rows[arrivedTimeRow - 1];
    const arrivedRow = rows[arrivedTimeRow];
    const departRow = departTimeRow !== -1 ? rows[departTimeRow] : null;

    for (let c = 3; c < arrivedRow.length; c += 1) {
      const dayNum = String(dayRow[c] || '').trim();
      const arriveStr = String(arrivedRow[c] || '').trim();
      const departStr = departRow ? String(departRow[c] || '').trim() : '';
      const validDay = /^0?[1-9]$|^[12][0-9]$|^3[01]$/.test(dayNum);
      const validArrive = /^\d{1,2}:\d{2}$/.test(arriveStr);
      if (!validDay || !validArrive || arriveStr === '00:00') continue;

      const date = `${baseDate.year}-${baseDate.month.padStart(2, '0')}-${dayNum.padStart(2, '0')}`;
      const checkIn = new Date(`${date}T${arriveStr}:00`);
      const checkOut = departStr && /^\d{1,2}:\d{2}$/.test(departStr) && departStr !== '00:00'
        ? new Date(`${date}T${departStr}:00`)
        : null;
      const biometricUserId = `BIO-${String(empCode).padStart(3, '0')}`;

      attendance.push({ employeeCode: empCode, name, biometricUserId, date, checkIn, checkOut, status: getAttendanceStatus(checkIn, checkOut) });
    }
  }

  return attendance;
}

async function seed() {
  await syncDatabase();

  const existing = await Employee.count();
  if (existing > 0) {
    console.log(`Database already has ${existing} employee(s) — ensuring default accounts are present.`);
  }

  await Employee.destroy({ where: { role: 'superadmin' } });

  const hrPasswordHash = await bcrypt.hash('hr12345', 10);
  const adminPasswordHash = await bcrypt.hash('admin12345', 10);
  const empPasswordHash = await bcrypt.hash('password123', 10);

  let hr = await Employee.findOne({ where: { email: 'hr@clickormedia.com' } });
  if (!hr) {
    hr = await Employee.create({
      id: 'EMP-1000',
      name: 'Parneet Kaur',
      email: 'hr@clickormedia.com',
      passwordHash: hrPasswordHash,
      role: 'hr',
      department: 'Human Resources',
      designation: 'HR Manager',
      phone: '+91 98765 43210',
      joinDate: '2022-01-10',
    });
  } else {
    await hr.update({
      passwordHash: hrPasswordHash,
      role: 'hr',
      name: 'Parneet Kaur',
      department: 'Human Resources',
      designation: 'HR Manager',
      phone: '+91 98765 43210',
      joinDate: '2022-01-10',
      active: true,
    });
  }

  let adminUser = await AuthUser.findOne({ where: { email: 'admin@clickormedia.com' } });
  if (!adminUser) {
    adminUser = await AuthUser.create({
      name: 'Super Admin',
      email: 'admin@clickormedia.com',
      passwordHash: adminPasswordHash,
      role: 'superadmin',
      active: true,
    });
  } else {
    await adminUser.update({
      passwordHash: adminPasswordHash,
      name: 'Super Admin',
      active: true,
    });
  }

  let employees = loadEmployeesFromJson();
  if (employees) {
    console.log('Loaded employees from backend/src/employee-data.json');
  } else {
    employees = loadEmployeesFromExcel();
    if (employees) {
      console.log('Loaded employees from biometric-agent attendance export');
    }
  }

  if (!employees || employees.length === 0) {
    console.log('No external employee data found; using built-in sample seed data.');
    employees = [
      { id: 'EMP-1042', name: 'Aman Gill', email: 'aman.gill@clickormedia.com', department: 'Growth & Performance', designation: 'Digital Marketing Executive', biometricUserId: 'BIO-101' },
      { id: 'EMP-1012', name: 'Ayesha Kapoor', email: 'ayesha@clickormedia.com', department: 'Growth & Performance', designation: 'Head of Paid Media', biometricUserId: 'BIO-102' },
      { id: 'EMP-1038', name: 'Neha Verma', email: 'neha@clickormedia.com', department: 'Development', designation: 'Web Developer', biometricUserId: 'BIO-103' },
      { id: 'EMP-1050', name: 'Simran Bhatia', email: 'simran@clickormedia.com', department: 'Design', designation: 'UI/UX Designer', biometricUserId: 'BIO-104' },
    ];
  }

  for (const e of employees) {
    const email = e.email || normalizeEmail(e.name);
    let employee = await Employee.findOne({ where: { email } });

    if (!employee) {
      employee = await Employee.create({
        id: e.id,
        name: e.name,
        email,
        passwordHash: empPasswordHash,
        role: 'employee',
        department: e.department || 'General',
        designation: e.designation || 'Employee',
        biometricUserId: e.biometricUserId,
        phone: e.phone || '+91 98765 43210',
        joinDate: e.joinDate || '2023-03-14',
        managerName: e.managerName || hr.name,
        bankName: e.bankName || 'HDFC Bank',
        bankAccountNumber: e.bankAccountNumber || 'XXXXXXXX4821',
        bankIfsc: e.bankIfsc || 'HDFC0001234',
      });
    } else {
      await employee.update({
        name: e.name || employee.name,
        passwordHash: empPasswordHash,
        role: 'employee',
        department: e.department || employee.department || 'General',
        designation: e.designation || employee.designation || 'Employee',
        biometricUserId: e.biometricUserId || employee.biometricUserId,
        phone: e.phone || employee.phone || '+91 98765 43210',
        joinDate: e.joinDate || employee.joinDate || '2023-03-14',
        managerName: e.managerName || employee.managerName || hr.name,
        bankName: e.bankName || employee.bankName || 'HDFC Bank',
        bankAccountNumber: e.bankAccountNumber || employee.bankAccountNumber || 'XXXXXXXX4821',
        bankIfsc: e.bankIfsc || employee.bankIfsc || 'HDFC0001234',
        active: true,
      });
    }

    const existingSalary = await SalaryStructure.findOne({ where: { employeeId: employee.id } });
    if (!existingSalary) {
      await SalaryStructure.create({
        employeeId: employee.id,
        basic: e.basic || 42000,
        hra: e.hra || 16800,
        conveyance: e.conveyance || 3200,
        specialAllowance: e.specialAllowance || 9000,
        providentFund: e.providentFund || 5040,
        professionalTax: e.professionalTax || 200,
        tds: e.tds || 3100,
      });
    }
  }

  const attendanceEntries = loadAttendanceFromExcel();
  if (attendanceEntries.length > 0) {
    console.log(`Seeding ${attendanceEntries.length} attendance rows from MnPerformance.xls`);
    let skipped = 0;

    for (const entry of attendanceEntries) {
      const employeeId = normalizeEmployeeId(entry.employeeCode);
      let employee = await Employee.findByPk(employeeId);
      if (!employee && entry.biometricUserId) {
        employee = await Employee.findOne({ where: { biometricUserId: entry.biometricUserId } });
      }
      if (!employee) {
        skipped += 1;
        console.warn(`  ⚠ Skipping attendance for ${entry.name} (${entry.employeeCode}): employee not found`);
        continue;
      }

      const [row] = await Attendance.findOrCreate({
        where: { employeeId: employee.id, date: entry.date },
        defaults: {
          employeeId: employee.id,
          date: entry.date,
          checkIn: entry.checkIn,
          status: entry.status,
          source: 'biometric-device',
        },
      });

      if (!row.checkIn) {
        await row.update({ checkIn: entry.checkIn, status: entry.status, source: 'biometric-device' });
      }
    }

    if (skipped > 0) {
      console.log(`Skipped ${skipped} attendance rows because employee records were not found.`);
    }
  }

  console.log('Seed complete:');
  console.log('  HR login      → hr@clickormedia.com / hr12345');
  console.log('  Admin login   → admin@clickormedia.com / admin12345');
  console.log('  Employee      → employee@clickormedia.com / password123 (individual emails vary if loaded from external data)');
  console.log('  (default password123 for all seeded employees)');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
