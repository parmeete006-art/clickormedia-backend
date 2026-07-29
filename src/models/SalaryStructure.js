const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

const SalaryStructure = sequelize.define('SalaryStructure', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.STRING, allowNull: false, unique: true },
  basic: { type: DataTypes.FLOAT, defaultValue: 0 },
  hra: { type: DataTypes.FLOAT, defaultValue: 0 },
  conveyance: { type: DataTypes.FLOAT, defaultValue: 0 },
  specialAllowance: { type: DataTypes.FLOAT, defaultValue: 0 },
  providentFund: { type: DataTypes.FLOAT, defaultValue: 0 },
  professionalTax: { type: DataTypes.FLOAT, defaultValue: 0 },
  tds: { type: DataTypes.FLOAT, defaultValue: 0 },
  currency: { type: DataTypes.STRING, defaultValue: '₹' },
}, {
  tableName: 'salary_structures',
  timestamps: true,
});

module.exports = SalaryStructure;
