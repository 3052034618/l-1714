const dayjs = require('dayjs');

function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  return dayjs(date).format(format);
}

function addDays(date, days) {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD HH:mm:ss');
}

function addBusinessDays(date, days) {
  let result = dayjs(date);
  let added = 0;
  while (added < days) {
    result = result.add(1, 'day');
    const dayOfWeek = result.day();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result.format('YYYY-MM-DD HH:mm:ss');
}

function isOverdue(date) {
  return dayjs(date).isBefore(dayjs());
}

function daysBetween(date1, date2) {
  return Math.abs(dayjs(date1).diff(dayjs(date2), 'day'));
}

function getMonthRange(year, month) {
  const start = dayjs(`${year}-${month}-01`).startOf('month');
  const end = start.endOf('month');
  return {
    start: start.format('YYYY-MM-DD HH:mm:ss'),
    end: end.format('YYYY-MM-DD HH:mm:ss')
  };
}

function getCurrentMonthRange() {
  const now = dayjs();
  return getMonthRange(now.year(), now.month() + 1);
}

module.exports = {
  formatDate,
  addDays,
  addBusinessDays,
  isOverdue,
  daysBetween,
  getMonthRange,
  getCurrentMonthRange
};
