/**
 * Copies every row from your local sqlite file into Supabase Postgres.
 *
 * Usage:
 *   1. Fill in DATABASE_URL in backend/.env with your Supabase connection string
 *   2. From backend/:  node scripts/migrate-to-supabase.js
 *
 * Safe to re-run — it skips rows that already exist on the target (matched
 * by primary key via ON CONFLICT DO NOTHING), so re-running after a partial
 * failure won't create duplicates.
 */
require('dotenv').config();
const path = require('path');
const { Sequelize } = require('sequelize');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in backend/.env — paste your Supabase connection string in first.');
  process.exit(1);
}

const SQLITE_PATH = process.env.SOURCE_SQLITE_PATH
  || path.join(__dirname, '..', 'data', 'clickormedia.sqlite');

// Source: your local sqlite file, read directly (independent of app config).
const source = new Sequelize({ dialect: 'sqlite', storage: SQLITE_PATH, logging: false });

// Target: reuses the app's own models/connection, which already reads
// DATABASE_URL and applies the Supabase SSL settings from src/config/db.js.
const { sequelize: target, syncDatabase } = require('../src/models/index.js');

// Table order matters: Employee/AuthUser first since everything else
// references employeeId as a foreign key.
const TABLES = [
  'employees',
  'auth_users',
  'attendance',
  'documents',
  'leave_requests',
  'salary_structures',
  'payslips',
  'announcements',
];

// sqlite stores booleans as 0/1 integers; Postgres needs real booleans, and
// a raw integer bind against a boolean column can error out during insert.
const BOOLEAN_COLUMNS = {
  employees: ['active'],
  auth_users: ['active'],
};

function normalizeRowForTarget(name, row) {
  const normalized = { ...row };

  if (name === 'attendance') {
    const allowedSources = ['manual', 'biometric-device', 'admin'];
    if (!allowedSources.includes(normalized.source)) {
      normalized.source = 'manual';
    }

    for (const field of ['checkIn', 'checkOut']) {
      if (normalized[field] === '') {
        normalized[field] = null;
      }
    }
  }

  return normalized;
}

async function migrateTable(name) {
  const [rows] = await source.query(`SELECT * FROM "${name}"`);
  if (rows.length === 0) {
    console.log(`  ${name}: 0 rows, skipping`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const quotedCols = columns.map((c) => `"${c}"`).join(', ');
  const boolCols = BOOLEAN_COLUMNS[name] || [];

  let inserted = 0;
  for (const row of rows) {
    const normalizedRow = normalizeRowForTarget(name, row);
    const values = columns.map((c) => (boolCols.includes(c) ? !!normalizedRow[c] : normalizedRow[c]));
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    try {
      await target.query(
        `INSERT INTO "${name}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        { bind: values }
      );
      inserted += 1;
    } catch (err) {
      console.error(`  ${name}: failed on row ${JSON.stringify(normalizedRow).slice(0, 120)} — ${err.message}`);
    }
  }
  console.log(`  ${name}: ${inserted}/${rows.length} rows processed`);
}

async function main() {
  console.log(`Source (sqlite): ${SQLITE_PATH}`);
  console.log('Target (Postgres): Supabase, from DATABASE_URL\n');

  await source.authenticate();
  await target.authenticate();

  console.log('Creating tables on target if they do not exist yet...');
  await syncDatabase();

  console.log('\nCopying data:');
  for (const table of TABLES) {
    await migrateTable(table);
  }

  console.log("\nDone. Spot-check a few records in Supabase's Table Editor before relying on this fully.");
  await source.close();
  await target.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
