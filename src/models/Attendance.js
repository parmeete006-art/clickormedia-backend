const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.STRING, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false }, // YYYY-MM-DD, one row per employee per day
  checkIn: DataTypes.DATE,
  checkOut: DataTypes.DATE,
  status: { type: DataTypes.ENUM('Present', 'Absent', 'Late', 'Leave', 'Weekend', 'Holiday'), defaultValue: 'Present' },
  source: { type: DataTypes.ENUM('manual', 'biometric-device', 'admin'), defaultValue: 'manual' },
}, {
  tableName: 'attendance',
  timestamps: true,
  indexes: [{ unique: true, fields: ['employeeId', 'date'] }],
});

module.exports = Attendance;
