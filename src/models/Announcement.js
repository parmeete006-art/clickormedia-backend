const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

const Announcement = sequelize.define('Announcement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING, allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  tag: { type: DataTypes.STRING, allowNull: false, defaultValue: 'General' },
  createdBy: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'announcements',
  timestamps: true,
});

module.exports = Announcement;
