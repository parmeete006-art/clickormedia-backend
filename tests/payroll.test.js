const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePayrollForMonth, countSundaysInMonthForEmployee, getPayrollDaysInMonth } = require('../src/utils/payroll.js');

function assertApproxEqual(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${expected} but got ${actual}`);
}

test('uses the actual number of days in the selected month for payroll calculations', () => {
  const result = calculatePayrollForMonth({
    gross: 30000,
    absentDays: 2,
    leaveDays: 1,
    halfDays: 1,
    presentDays: 20,
    sundayDays: 4,
    month: 1,
    year: 2024,
  });

  const daysInMonth = getPayrollDaysInMonth(1, 2024);
  assert.equal(daysInMonth, 29);
  assert.equal(result.totalDaysForSalary, 29);
  assertApproxEqual(result.dailyRate, 30000 / 29);
  assert.equal(result.chargeableAbsentDays, 1);
  assert.equal(result.deductionDays, 1);
  assertApproxEqual(result.attendanceDeduction, 30000 / 29);
  assert.equal(result.paidDays, 24);
  assertApproxEqual(result.gross, 24827.5862);
  assertApproxEqual(result.net, 23793.1034);
});

test('counts Sundays only from the employee joining date', () => {
  const sundayCount = countSundaysInMonthForEmployee(6, 2026, '2026-07-15');
  assert.equal(sundayCount, 2);
});

test('allows one half day free and deducts only additional half days', () => {
  const result = calculatePayrollForMonth({
    gross: 30000,
    absentDays: 0,
    leaveDays: 0,
    halfDays: 2,
    presentDays: 20,
    sundayDays: 4,
    month: 1,
    year: 2025,
  });

  assert.equal(result.deductionDays, 0.5);
  assertApproxEqual(result.attendanceDeduction, 535.7143);
  assertApproxEqual(result.net, 25178.5714);
});
