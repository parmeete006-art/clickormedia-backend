const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const {
  mySalary, myPayslips, getSalary, upsertSalary, generatePayslip, markPayslipPaid, allPayslips,
} = require('../controllers/payrollController.js');

const router = express.Router();

router.use(requireAuth);
router.get('/mine/salary', mySalary);
router.get('/mine/payslips', myPayslips);

router.get('/salary/:employeeId', requireRole('hr', 'admin', 'superadmin'), getSalary);
router.put('/salary/:employeeId', requireRole('hr', 'admin'), upsertSalary);
router.post('/payslips/:employeeId/generate', requireRole('hr', 'admin'), generatePayslip);
router.put('/payslips/:id/mark-paid', requireRole('hr', 'admin'), markPayslipPaid);
router.get('/payslips', requireRole('hr', 'admin', 'superadmin'), allPayslips);

module.exports = router;
