function normalizeText(value) {
  return String(value ?? '').trim();
}

function parseTimeValue(rawTime) {
  const text = normalizeText(rawTime).replace(/[^0-9:]/g, '');
  if (!text) return null;

  const match = text.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || '00');
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildAttendanceImportPayload({ date, dayNum, timeStr, empName = '', empCode = '' }) {
  const normalizedName = normalizeText(empName).toLowerCase();
  const dayNumber = Number(dayNum);
  const dateValue = normalizeText(date);
  const parsedTime = parseTimeValue(timeStr);
  const isSunday = dateValue ? new Date(`${dateValue}T00:00:00`).getDay() === 0 : false;
  const isDaySix = dayNumber === 6;

  let status = 'Present';
  let checkIn = null;
  let checkOut = null;

  if (isSunday) {
    status = 'Holiday';
  } else if (isDaySix) {
    if (normalizedName.includes('kartik')) {
      status = 'Absent';
    } else {
      checkIn = new Date(`${dateValue}T09:00:00`);
      checkOut = new Date(`${dateValue}T18:00:00`);
    }
  } else if (parsedTime) {
    checkIn = new Date(`${dateValue}T${parsedTime}:00`);
    checkOut = new Date(`${dateValue}T18:00:00`);
  } else if (normalizedName.includes('kartik')) {
    status = 'Absent';
  } else {
    status = 'Absent';
  }

  return {
    date: dateValue,
    empCode: normalizeText(empCode),
    empName: normalizeText(empName),
    status,
    checkIn,
    checkOut,
  };
}

module.exports = { parseTimeValue, buildAttendanceImportPayload };
