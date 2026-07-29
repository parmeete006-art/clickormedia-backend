const { Op } = require('sequelize');
const { LeaveRequest, Employee, Attendance } = require('../models/index.js');

function toDateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function eachDateInRange(from, to) {
  const dates = [];
  const cursor = new Date(from);
  const end = new Date(to);
  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function myLeaves(req, res) {
  const rows = await LeaveRequest.findAll({ where: { employeeId: req.user.id }, order: [['createdAt', 'DESC']] });
  res.json(rows);
}

async function applyLeave(req, res) {
  const { type, fromDate, toDate, reason } = req.body;
  if (!type || !fromDate || !toDate) {
    return res.status(400).json({ error: 'type, fromDate, and toDate are required' });
  }

  const employee = await Employee.findByPk(req.user.id);
  const isHr = employee && ['hr', 'admin'].includes(employee.role);
  const initialStatus = isHr ? 'Pending' : 'Pending';

  const row = await LeaveRequest.create({
    employeeId: req.user.id,
    type,
    fromDate,
    toDate,
    reason,
    status: initialStatus,
    reviewedBy: isHr ? 'Super Admin' : null,
  });
  res.status(201).json(row);
}

/** HR/admin: view all leave requests, optionally filtered by status. */
async function allLeaves(req, res) {
  const { status } = req.query;
  const where = status ? { status } : {};

  let employeeFilter = {};
  if (req.user.role === 'employee') {
    employeeFilter = { id: req.user.id };
  } else if (req.user.role === 'admin' || req.user.role === 'hr') {
    // HR/admin should primarily see employee requests (role === 'employee')
    employeeFilter = { role: 'employee' };
  }

  const rows = await LeaveRequest.findAll({
    where,
    include: [{
      model: Employee,
      attributes: ['id', 'name', 'department', 'role'],
      where: employeeFilter,
    }],
    order: [['createdAt', 'DESC']],
  });
  res.json(rows);
}

async function reviewLeave(req, res) {
  const { status, reviewNote } = req.body; // status: 'Approved' | 'Rejected'
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: "status must be 'Approved' or 'Rejected'" });
  }
  const row = await LeaveRequest.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'Leave request not found' });

  await row.update({ status, reviewNote, reviewedBy: req.user.name });

  if (status === 'Approved') {
    const days = eachDateInRange(row.fromDate, row.toDate);
    for (const date of days) {
      const dow = new Date(date).getDay();
      if (dow === 0 || dow === 6) continue; // don't overwrite weekends
      const [attendanceRow] = await Attendance.findOrCreate({
        where: { employeeId: row.employeeId, date },
        defaults: { employeeId: row.employeeId, date, status: 'Leave', source: 'admin' },
      });
      if (!attendanceRow.checkIn) {
        await attendanceRow.update({ status: 'Leave', source: 'admin' });
      }
    }
  }

  res.json(row);
}

module.exports = { myLeaves, applyLeave, allLeaves, reviewLeave };
