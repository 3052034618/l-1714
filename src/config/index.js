const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  db: {
    path: path.join(__dirname, '../data/offboarding.db')
  },
  upload: {
    dir: path.join(__dirname, '../uploads'),
    maxSize: 50 * 1024 * 1024
  },
  report: {
    dir: path.join(__dirname, '../reports')
  },
  interview: {
    defaultDaysAfterResignation: 3,
    remindIntervalDays: 1,
    maxReminders: 3,
    escalationRole: 'hr_director'
  },
  knowledgeTransfer: {
    defaultDeadlineDays: 14,
    remindIntervalDays: 3,
    escalationDays: 7
  }
};
