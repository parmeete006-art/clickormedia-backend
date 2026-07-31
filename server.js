require('dotenv').config();
const bcrypt = require('bcryptjs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { sequelize, syncDatabase, AuthUser, Employee } = require('./src/models/index.js');

const authRoutes = require('./src/routes/auth.js');
const employeeRoutes = require('./src/routes/employees.js');
const attendanceRoutes = require('./src/routes/attendance.js');
const documentRoutes = require('./src/routes/documents.js');
const leaveRoutes = require('./src/routes/leave.js');
const payrollRoutes = require('./src/routes/payroll.js');
const dashboardRoutes = require('./src/routes/dashboard.js');
const announcementRoutes = require('./src/routes/announcements.js');

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'clickor-media-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/announcements', announcementRoutes);

// Uploaded files aren't served statically on purpose — downloads go through
// the authenticated /api/documents/:id/download route instead, so only the
// owner or HR can fetch a given file.

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

const PORT = process.env.PORT || 4000;

async function ensureDefaultAccounts() {
  const defaultEmail = 'admin@clickormedia.com';
  const existingAdmin = await AuthUser.findOne({ where: { email: defaultEmail } });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin12345', 10);
    await AuthUser.create({
      name: 'Super Admin',
      email: defaultEmail,
      passwordHash,
      role: 'superadmin',
      active: true,
    });
  }

  const employeeCount = await Employee.count();
  if (employeeCount === 0) {
    const employeePasswordHash = await bcrypt.hash('password123', 10);
    await Employee.create({
      id: 'EMP-1000',
      name: 'Default Employee',
      email: 'employee@clickormedia.com',
      passwordHash: employeePasswordHash,
      role: 'employee',
      department: 'General',
      designation: 'Employee',
      active: true,
    });
  }
}

async function initializeDatabase() {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sequelize.authenticate();
      await syncDatabase();
      await ensureDefaultAccounts();
      console.log('Database ready');
      return true;
    } catch (err) {
      console.error(`Database sync attempt ${attempt}/${maxAttempts} failed:`, err.message);
      if (attempt === maxAttempts) {
        console.warn('Continuing without initial database sync; the API will start in degraded mode.');
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

initializeDatabase().then(() => {
  app.listen(PORT, () => console.log(`Clickor Media API running on http://localhost:${PORT}`));
});
