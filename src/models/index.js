const sequelize = require('../config/db.js');
const Employee = require('./Employee.js');
const AuthUser = require('./AuthUser.js');
const Attendance = require('./Attendance.js');
const Document = require('./Document.js');
const LeaveRequest = require('./LeaveRequest.js');
const SalaryStructure = require('./SalaryStructure.js');
const Payslip = require('./Payslip.js');
const Announcement = require('./Announcement.js');

Employee.hasMany(Attendance, { foreignKey: 'employeeId', sourceKey: 'id' });
Attendance.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'id' });

Employee.hasMany(Document, { foreignKey: 'employeeId', sourceKey: 'id' });
Document.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'id' });

Employee.hasMany(LeaveRequest, { foreignKey: 'employeeId', sourceKey: 'id' });
LeaveRequest.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'id' });

Employee.hasMany(Announcement, { foreignKey: 'createdBy', sourceKey: 'id' });
Announcement.belongsTo(Employee, { foreignKey: 'createdBy', targetKey: 'id' });

Employee.hasOne(SalaryStructure, { foreignKey: 'employeeId', sourceKey: 'id' });
SalaryStructure.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'id' });

Employee.hasMany(Payslip, { foreignKey: 'employeeId', sourceKey: 'id' });
Payslip.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'id' });

async function syncDatabase() {
  await sequelize.sync(); // creates tables if they don't exist yet
}

module.exports = {
  sequelize,
  syncDatabase,
  Employee,
  AuthUser,
  Attendance,
  Document,
  LeaveRequest,
  SalaryStructure,
  Payslip,
  Announcement,
};
