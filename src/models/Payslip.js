const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

const Payslip = sequelize.define('Payslip', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.STRING, allowNull: false },
  month: { type: DataTypes.INTEGER, allowNull: false }, // 0-11
  year: { type: DataTypes.INTEGER, allowNull: false },
  gross: DataTypes.FLOAT,
  deductions: DataTypes.FLOAT,
  net: DataTypes.FLOAT,
  status: { type: DataTypes.ENUM('Processing', 'Paid'), defaultValue: 'Processing' },
  generatedBy: DataTypes.STRING,

  // Attendance-driven breakdown, so employees can see exactly why a month
  // was docked instead of just seeing a smaller number.
  presentDays: { type: DataTypes.INTEGER, defaultValue: 0 },
  absentDays: { type: DataTypes.INTEGER, defaultValue: 0 },
  leaveDays: { type: DataTypes.INTEGER, defaultValue: 0 },
  chargeableLeaveDays: { type: DataTypes.INTEGER, defaultValue: 0 }, // days beyond the free allowance
  attendanceDeduction: { type: DataTypes.FLOAT, defaultValue: 0 },
}, {
  tableName: 'payslips',
  timestamps: true,
  indexes: [{ unique: true, fields: ['employeeId', 'month', 'year'] }],
});

module.exports = Payslip;
