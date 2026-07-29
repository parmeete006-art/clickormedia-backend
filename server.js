require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { syncDatabase } = require('./src/models/index.js');

const authRoutes = require('./src/routes/auth.js');
const employeeRoutes = require('./src/routes/employees.js');
const attendanceRoutes = require('./src/routes/attendance.js');
const documentRoutes = require('./src/routes/documents.js');
const leaveRoutes = require('./src/routes/leave.js');
const payrollRoutes = require('./src/routes/payroll.js');
const dashboardRoutes = require('./src/routes/dashboard.js');
const announcementRoutes = require('./src/routes/announcements.js');

const app = express();

app.use(cors());
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

syncDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Clickor Media API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to sync database:', err);
    process.exit(1);
  });
