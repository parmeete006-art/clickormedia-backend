const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Employee, AuthUser } = require('../models/index.js');

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const normalizedEmail = email.toLowerCase().trim();
  let user = await AuthUser.findOne({ where: { email: normalizedEmail } });
  let source = 'auth';

  if (!user) {
    user = await Employee.findOne({ where: { email: normalizedEmail } });
    source = 'employee';
  }

  if (!user || !user.active) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, source },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const { passwordHash, ...safeUser } = user.toJSON();
  res.json({ token, user: safeUser });
}

async function me(req, res) {
  const user = req.user.role === 'superadmin'
    ? await AuthUser.findByPk(req.user.id)
    : await Employee.findByPk(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found' });
  const { passwordHash, ...safeUser } = user.toJSON();
  res.json(safeUser);
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const user = req.user.role === 'superadmin'
    ? await AuthUser.findByPk(req.user.id)
    : await Employee.findByPk(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await user.update({ passwordHash });

  res.json({ ok: true, message: 'Password updated successfully' });
}

async function updateMe(req, res) {
  const updates = {};
  const allowedFields = req.user.role === 'superadmin'
    ? ['name']
    : ['name', 'phone', 'department', 'designation'];

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates[field] = req.body[field];
    }
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid profile fields to update' });
  }

  const user = req.user.role === 'superadmin'
    ? await AuthUser.findByPk(req.user.id)
    : await Employee.findByPk(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  await user.update(updates);
  const { passwordHash, ...safeUser } = user.toJSON();
  res.json(safeUser);
}

module.exports = { login, me, changePassword, updateMe };
