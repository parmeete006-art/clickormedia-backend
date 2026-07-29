const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

const Employee = sequelize.define('Employee', {
  id: { type: DataTypes.STRING, primaryKey: true }, // e.g. EMP-1042
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('employee', 'hr', 'admin'), defaultValue: 'employee' },
  department: DataTypes.STRING,
  designation: DataTypes.STRING,
  phone: DataTypes.STRING,
  managerName: DataTypes.STRING,
  joinDate: DataTypes.DATEONLY,
  active: { type: DataTypes.BOOLEAN, defaultValue: true },

  // Maps this employee to their fingerprint/face ID on the office biometric
  // terminal, so incoming punches can be matched to the right person.
  biometricUserId: { type: DataTypes.STRING, unique: true, allowNull: true },

  bankName: DataTypes.STRING,
  bankAccountNumber: DataTypes.STRING,
  bankIfsc: DataTypes.STRING,
}, {
  tableName: 'employees',
  timestamps: true,
});

module.exports = Employee;
