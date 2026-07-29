const { Employee, Attendance, LeaveRequest } = require('../models/index.js');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function summary(req, res) {
  const date = todayKey();

  const [totalEmployees, todayRows, pendingLeaves] = await Promise.all([
    Employee.count({ where: { active: true } }),
    Attendance.findAll({ where: { date } }),
    LeaveRequest.count({ where: { status: 'Pending' } }),
  ]);

  const presentToday = todayRows.filter((r) => ['Present', 'Late'].includes(r.status)).length;
  const lateToday = todayRows.filter((r) => r.status === 'Late').length;

  res.json({
    date,
    totalEmployees,
    presentToday,
    lateToday,
    absentToday: Math.max(totalEmployees - todayRows.length, 0),
    pendingLeaves,
  });
}

module.exports = { summary };
