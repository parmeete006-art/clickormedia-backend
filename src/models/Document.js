const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

const Document = sequelize.define('Document', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.ENUM('ID Proof', 'Contracts', 'Payslips', 'Certificates', 'Other'), defaultValue: 'Other' },
  filePath: { type: DataTypes.STRING, allowNull: false }, // relative path under /uploads
  fileSize: DataTypes.INTEGER, // bytes
  uploadedBy: DataTypes.STRING, // employeeId or "HR"
}, {
  tableName: 'documents',
  timestamps: true,
});

module.exports = Document;
