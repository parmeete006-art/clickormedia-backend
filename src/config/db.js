const { Sequelize } = require('sequelize');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to connect to Postgres/Supabase.');
}

const isProduction = ['production', 'staging'].includes((process.env.NODE_ENV || '').toLowerCase());

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000,
  },
  dialectOptions: {
    ssl: isProduction
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
});

module.exports = sequelize;
