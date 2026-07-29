const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePayrollForMonth, PAYROLL_DAYS_PER_MONTH } = require('../src/utils/payroll.js');

test('uses a fixed 30-day month for payroll calculations', () => {
  const result = calculatePayrollForMonth({
    gross: 30000,
    absentDays: 2,
    leaveDays: 1,
    halfDays: 1,
  });

  assert.equal(PAYROLL_DAYS_PER_MONTH, 30);
  assert.equal(result.dailyRate, 1000);
  assert.equal(result.chargeableAbsentDays, 1);
  assert.equal(result.deductionDays, 1.5);
  assert.equal(result.attendanceDeduction, 1500);
  assert.equal(result.paidDays, 28.5);
  assert.equal(result.net, 28500);
});
