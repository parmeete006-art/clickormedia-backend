const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const configuredDialect = process.env.DB_DIALECT || (process.env.DATABASE_URL ? 'postgres' : 'sqlite');

let sequelize;

if (configuredDialect === 'sqlite' || !process.env.DATABASE_URL) {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || path.join(__dirname, '..', '..', 'data', 'clickormedia.sqlite'),
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
} else {
  const parsedUrl = new URL(process.env.DATABASE_URL);

  sequelize = new Sequelize({
    dialect: 'postgres',
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 5432),
    username: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: parsedUrl.pathname.replace(/^\/+/, ''),
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
      family: 4,
    },
    pool: { max: 5, min: 0, acquire: 60000, idle: 10000 },
  });
}

module.exports = sequelize;
