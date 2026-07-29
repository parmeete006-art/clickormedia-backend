function computeGross(structure) {
  return (
    (structure.basic || 0)
    + (structure.hra || 0)
    + (structure.conveyance || 0)
    + (structure.specialAllowance || 0)
  );
}

function computeDeductions(structure) {
  return (
    (structure.providentFund || 0)
    + (structure.professionalTax || 0)
    + (structure.tds || 0)
  );
}

function computeNet(structure) {
  return computeGross(structure) - computeDeductions(structure);
}

// One leave day is treated as a paid allowance.
// Deductions apply only to absences (and half-days on absences).
const FREE_LEAVE_DAYS_PER_MONTH = 1;

/** Counts non-weekend calendar days in a given month (0-11), i.e. the days that count as "working days". */
function workingDaysInMonth(month, year) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month, day).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/**
 * Attendance policy: one leave day is paid as an allowance, and deductions
 * apply only to absences (plus half-day deductions on absences).
 */
function computeAttendanceDeduction({ gross, month, year, absentDays, leaveDays, halfDays }) {
  const halfDayDeductionDays = halfDays * 0.5;
  const workingDays = workingDaysInMonth(month, year);
  const perDayRate = workingDays > 0 ? gross / workingDays : 0;
  const totalChargeableDays = absentDays + halfDayDeductionDays;
  const deduction = Math.round(totalChargeableDays * perDayRate);
  return { chargeableDays: absentDays, halfDayDeductionDays, perDayRate, deduction, workingDays, paidLeaveDays: Math.min(leaveDays, FREE_LEAVE_DAYS_PER_MONTH) };
}

module.exports = {
  computeGross, computeDeductions, computeNet,
  workingDaysInMonth, computeAttendanceDeduction, FREE_LEAVE_DAYS_PER_MONTH,
};
