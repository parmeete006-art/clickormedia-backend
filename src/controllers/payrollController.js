const { Op } = require('sequelize');
const { SalaryStructure, Payslip, Employee, Attendance } = require('../models/index.js');
const { computeGross, computeDeductions, computeNet, computeAttendanceDeduction, workingDaysInMonth } = require('../utils/payroll.js');

function withTotals(structure) {
  const s = structure.toJSON ? structure.toJSON() : structure;
  return { ...s, gross: computeGross(s), deductions: computeDeductions(s), net: computeNet(s) };
}

function enrichPayslip(row) {
  const p = row.toJSON ? row.toJSON() : row;
  const workingDays = workingDaysInMonth(Number(p.month), Number(p.year));
  const dailyRate = workingDays > 0 ? Number(p.gross || 0) / workingDays : 0;
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
 * month, using their real attendance for that month. Policy: the first
 * FREE_LEAVE_DAYS_PER_MONTH Absent/Leave days are forgiven; every day past
 * that is docked at (gross ÷ working days in the month).
 */
async function generatePayslip(req, res) {
  const { employeeId } = req.params;
  const { month, year } = req.body;
  if (month === undefined || !year) return res.status(400).json({ error: 'month (0-11) and year are required' });

  const structure = await SalaryStructure.findOne({ where: { employeeId } });
  if (!structure) return res.status(400).json({ error: 'Set up a salary structure for this employee first' });

  const monthNum = Number(month);
  const monthIndex = !Number.isNaN(monthNum) ? monthNum : null;
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

  const workingDayAttendanceRows = attendanceRows.filter((r) => {
    const date = new Date(r.date);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    return !isWeekend;
  });

  const halfDays = workingDayAttendanceRows.filter((r) => r.checkIn && r.checkOut && ((new Date(r.checkOut) - new Date(r.checkIn)) / 1000 / 60 / 60) < 4).length;
  const presentDays = workingDayAttendanceRows.filter((r) => {
    const duration = r.checkIn && r.checkOut ? ((new Date(r.checkOut) - new Date(r.checkIn)) / 1000 / 60 / 60) : null;
    const isHalfDay = duration !== null && duration < 4;
    return ['Present', 'Late'].includes(r.status) && !isHalfDay;
  }).length;
  const absentDays = workingDayAttendanceRows.filter((r) => r.status === 'Absent').length;
  const leaveDays = workingDayAttendanceRows.filter((r) => r.status === 'Leave').length;
  const paidLeaveDays = Math.min(leaveDays, 1);
  const paidDays = presentDays + paidLeaveDays;

  const gross = computeGross(structure);
  const standardDeductions = computeDeductions(structure);
  const { chargeableDays, halfDayDeductionDays, deduction: attendanceDeduction } = computeAttendanceDeduction({
    gross, month: Number(month), year: Number(year), absentDays, leaveDays, halfDays,
  });

  const totalDeductions = standardDeductions + attendanceDeduction;
  const net = gross - totalDeductions;

  const payload = {
    employeeId, month, year, gross, deductions: totalDeductions, net,
    generatedBy: req.user.name, presentDays: paidDays, absentDays, leaveDays,
    chargeableLeaveDays: chargeableDays, attendanceDeduction,
  };

  const [payslip] = await Payslip.findOrCreate({ where: { employeeId, month, year }, defaults: payload });
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
