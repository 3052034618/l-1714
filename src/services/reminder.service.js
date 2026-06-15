const db = require('../db');

function createReminder(data) {
  db.initDatabase();

  const reminder = db.insert('reminders', {
    related_id: data.relatedId,
    related_type: data.relatedType,
    recipient_id: data.recipientId || null,
    recipient_email: data.recipientEmail || null,
    reminder_type: data.reminderType,
    content: data.content || null
  });

  return reminder.id;
}

function getReminders(params = {}) {
  db.initDatabase();

  let list = db.findAll('reminders');

  if (params.related_type) {
    list = list.filter(item => item.related_type === params.related_type);
  }

  if (params.related_id) {
    list = list.filter(item => item.related_id === params.related_id);
  }

  if (params.reminder_type) {
    list = list.filter(item => item.reminder_type === params.reminder_type);
  }

  list = list.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return list.slice(0, 100);
}

function getPendingReminders() {
  return [];
}

module.exports = {
  createReminder,
  getReminders,
  getPendingReminders
};
