const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

const AuthUser = sequelize.define('AuthUser', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('superadmin'), allowNull: false, defaultValue: 'superadmin' },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: 'auth_users',
  timestamps: true,
});

module.exports = AuthUser;
