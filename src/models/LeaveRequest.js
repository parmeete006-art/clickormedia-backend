const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

const LeaveRequest = sequelize.define('LeaveRequest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.ENUM('Casual', 'Sick', 'Earned'), allowNull: false },
  fromDate: { type: DataTypes.DATEONLY, allowNull: false },
  toDate: { type: DataTypes.DATEONLY, allowNull: false },
  reason: DataTypes.TEXT,
  status: { type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'), defaultValue: 'Pending' },
  reviewedBy: DataTypes.STRING,
  reviewNote: DataTypes.STRING,
}, {
  tableName: 'leave_requests',
  timestamps: true,
});

module.exports = LeaveRequest;
