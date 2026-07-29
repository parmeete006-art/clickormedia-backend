const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const sqliteStorage = process.env.DB_STORAGE
  || path.resolve(process.cwd(), 'data', 'clickormedia.sqlite')
  || path.join(__dirname, '..', '..', 'data', 'clickormedia.sqlite');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: sqliteStorage,
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000,
  },
  dialectOptions: {
    timeout: 60000,
    busyTimeout: 60000,
  },
});

module.exports = sequelize;
