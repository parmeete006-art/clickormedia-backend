const { Op } = require('sequelize');
const { SalaryStructure, Payslip, Employee, Attendance } = require('../models/index.js');
const { computeGross, computeDeductions, computeNet, computeAttendanceDeduction, workingDaysInMonth, calculatePayrollForMonth, PAYROLL_DAYS_PER_MONTH, countSundaysInMonthForEmployee } = require('../utils/payroll.js');

function withTotals(structure) {
  const s = structure.toJSON ? structure.toJSON() : structure;
  return { ...s, gross: computeGross(s), deductions: computeDeductions(s), net: computeNet(s) };
}

function enrichPayslip(row) {
  const p = row.toJSON ? row.toJSON() : row;
  const workingDays = PAYROLL_DAYS_PER_MONTH;
  const dailyRate = Number(p.gross || 0) / PAYROLL_DAYS_PER_MONTH;
  return { ...p, workingDays, dailyRate };
}

async function mySalary(req, res) {
  const row = await SalaryStructure.findOne({ where: { employeeId: req.user.id } });
  if (!row) return res.status(404).json({ error: 'No salary structure on file yet' });
  res.json(withTotals(row));
}

async function myPayslips(req, res) {
  const rows = await Payslip.findAll({ where: { employeeId: req.user.id }, order: [['year', 'DESC'], ['month', 'DESC']] });
  res.json(rows.map(enrichPayslip));
}

/** HR/admin: view or set an employee's salary structure. */
async function getSalary(req, res) {
  const row = await SalaryStructure.findOne({ where: { employeeId: req.params.employeeId } });
  if (!row) return res.status(404).json({ error: 'No salary structure on file yet' });
  res.json(withTotals(row));
}

async function upsertSalary(req, res) {
  const { employeeId } = req.params;
  const patch = { ...req.body };
  delete patch.employeeId;

  const employee = await Employee.findByPk(employeeId);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const [row] = await SalaryStructure.findOrCreate({ where: { employeeId }, defaults: { employeeId } });
  await row.update(patch);
  res.json(withTotals(row));
}

/**
 * HR/admin: generate (or re-generate) a payslip for an employee for a given
 * month, using their real attendance for that month.
 * 
 * NEW POLICY: Salary is calculated on a fixed 30-day month.
 * - All 30 days are considered paid days (including Sundays/off days)
 * - Only actual absent days are deducted (not Sundays/off days)
 * - Half-day is counted as 0.5 day deduction
 * - 1 paid leave per month is given (if leave taken)
 */
async function generatePayslip(req, res) {
  const { employeeId } = req.params;
  const { month, year } = req.body;
  if (month === undefined || !year) return res.status(400).json({ error: 'month (0-11) and year are required' });

  const structure = await SalaryStructure.findOne({ where: { employeeId } });
  if (!structure) return res.status(400).json({ error: 'Set up a salary structure for this employee first' });

  const employee = await Employee.findByPk(employeeId);
  const joiningDate = employee?.joinDate || null;

  const monthNum = Number(month);
  const monthIndex = !Number.isNaN(monthNum) ? monthNum : null;
  
  // Get all attendance records for the month
  let attendanceFilter;
  if (monthIndex !== null && monthIndex >= 0 && monthIndex <= 11) {
    const monthStr = String(monthIndex + 1).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-${new Date(Number(year), monthIndex + 1, 0).getDate().toString().padStart(2, '0')}`;
    attendanceFilter = { [Op.gte]: startDate, [Op.lte]: endDate };
  } else {
    const monthStr = String(Number(month) + 1).padStart(2, '0');
    attendanceFilter = { [Op.like]: `${year}-${monthStr}-%` };
  }

  const attendanceRows = await Attendance.findAll({
    where: { employeeId, date: attendanceFilter },
  });

  // Get actual days in the month (for reference)
  const daysInMonth = new Date(Number(year), monthIndex + 1, 0).getDate();
  
  // Count attendance for ALL days (including weekends)
  const allDaysAttendance = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const record = attendanceRows.find(r => r.date === dateStr);
    allDaysAttendance[day] = record;
  }

  // Count absent days (excluding Sundays/off days)
  // NEW: Only count weekdays (Mon-Sat) as working days for attendance deduction
  let absentDays = 0;
  let leaveDays = 0;
  let halfDays = 0;
  let presentDays = 0;
  let sundayDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Number(year), monthIndex, day);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1-6 = Monday-Saturday

    if (dayOfWeek === 0) {
      const currentDate = new Date(Number(year), monthIndex, day);
      const joinDate = joiningDate ? new Date(joiningDate) : null;
      if (!joinDate || currentDate >= joinDate) {
        sundayDays++;
      }
      continue;
    }

    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 6;
    if (!isWeekday) continue;

    const record = attendanceRows.find(r => {
      const d = new Date(r.date);
      return d.getDate() === day && d.getMonth() === monthIndex && d.getFullYear() === Number(year);
    });

    if (!record || record.status === 'Absent') {
      absentDays++;
    } else if (record.status === 'Leave') {
      leaveDays++;
    } else if (record.status === 'Present' || record.status === 'Late') {
      if (record.checkIn && record.checkOut) {
        const duration = (new Date(record.checkOut) - new Date(record.checkIn)) / 1000 / 60 / 60;
        if (duration < 4) {
          halfDays++;
        } else {
          presentDays++;
        }
      } else {
        presentDays++;
      }
    }
  }

  const gross = computeGross(structure);
  const standardDeductions = computeDeductions(structure);
  const payroll = calculatePayrollForMonth({
    gross,
    absentDays,
    leaveDays,
    halfDays,
    standardDeductions,
    presentDays,
    sundayDays,
  });

  const payload = {
    employeeId,
    month: monthIndex,
    year: Number(year),
    gross: payroll.gross,
    deductions: payroll.totalDeductions,
    net: payroll.net,
    generatedBy: req.user.name,
    presentDays: payroll.paidDays,
    absentDays: absentDays,
    leaveDays: leaveDays,
    chargeableLeaveDays: payroll.chargeableAbsentDays,
    attendanceDeduction: payroll.attendanceDeduction,
  };

  const [payslip] = await Payslip.findOrCreate({ 
    where: { employeeId, month: monthIndex, year: Number(year) }, 
    defaults: payload 
  });
  await payslip.update(payload);

  res.status(201).json(enrichPayslip(payslip));
}

async function markPayslipPaid(req, res) {
  const payslip = await Payslip.findByPk(req.params.id);
  if (!payslip) return res.status(404).json({ error: 'Payslip not found' });
  await payslip.update({ status: 'Paid' });
  res.json(payslip);
}

/** HR/admin: list payslips, optionally filtered to one employee. */
async function allPayslips(req, res) {
  const { employeeId } = req.query;
  const where = employeeId ? { employeeId } : {};
  const rows = await Payslip.findAll({
    where,
    include: [{ model: Employee, attributes: ['id', 'name', 'department'] }],
    order: [['year', 'DESC'], ['month', 'DESC']],
  });
  res.json(rows.map(enrichPayslip));
}

module.exports = { mySalary, myPayslips, getSalary, upsertSalary, generatePayslip, markPayslipPaid, allPayslips };