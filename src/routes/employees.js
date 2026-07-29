const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const {
  listEmployees, getEmployee, createEmployee, updateEmployee, deactivateEmployee,
} = require('../controllers/employeeController.js');

const router = express.Router();

router.use(requireAuth);
router.get('/', listEmployees); // directory view for everyone; controller already excludes sensitive fields
router.post('/', requireRole('hr', 'admin'), createEmployee);
router.get('/:id', getEmployee); // employees can view their own record too
router.put('/:id', requireRole('hr', 'admin'), updateEmployee);
router.delete('/:id', requireRole('hr', 'admin'), deactivateEmployee);

module.exports = router;
