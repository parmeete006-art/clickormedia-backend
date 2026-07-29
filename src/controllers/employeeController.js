const bcrypt = require('bcryptjs');
const { Employee, SalaryStructure } = require('../models/index.js');

async function listEmployees(req, res) {
  const isHr = ['hr', 'admin', 'superadmin'].includes(req.user.role);
  const attributes = isHr
    ? { exclude: ['passwordHash'] }
    : ['id', 'name', 'role', 'department', 'designation', 'email']; // directory view: no bank/biometric/phone details

  const employees = await Employee.findAll({
    attributes,
    where: { role: ['employee', 'hr', 'admin'] },
    order: [['name', 'ASC']],
  });
  res.json(employees);
}

async function getEmployee(req, res) {
  const isHr = ['hr', 'admin', 'superadmin'].includes(req.user.role);
  if (!isHr && req.params.id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized to view this employee' });
  }
  const employee = await Employee.findByPk(req.params.id, { attributes: { exclude: ['passwordHash'] } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  res.json(employee);
}

async function createEmployee(req, res) {
  const {
    id,
    name,
    email,
    password,
    role,
    department,
    designation,
    phone,
    managerName,
    joinDate,
    biometricUserId,
    bankName,
    bankAccountNumber,
    bankIfsc,
  } = req.body;

  if (!id || !name || !email || !password) {
    return res.status(400).json({ error: 'id, name, email, and password are required' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const employee = await Employee.create({
    id,
    name,
    email: email.toLowerCase().trim(),
    passwordHash,
    role: role || 'employee',
    department,
    designation,
    phone,
    managerName,
    joinDate,
    biometricUserId,
    bankName,
    bankAccountNumber,
    bankIfsc,
  });

  await SalaryStructure.create({ employeeId: id });

  const { passwordHash: _, ...safe } = employee.toJSON();
  res.status(201).json(safe);
}

async function updateEmployee(req, res) {
  const employee = await Employee.findByPk(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const patch = { ...req.body };
  delete patch.id;
  delete patch.passwordHash;

  if (patch.password) {
    patch.passwordHash = await bcrypt.hash(patch.password, 10);
    delete patch.password;
  }

  await employee.update(patch);
  const { passwordHash, ...safe } = employee.toJSON();
  res.json(safe);
}

async function deactivateEmployee(req, res) {
  const employee = await Employee.findByPk(req.params.id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  await employee.update({ active: false });
  res.json({ ok: true });
}

module.exports = { listEmployees, getEmployee, createEmployee, updateEmployee, deactivateEmployee };
