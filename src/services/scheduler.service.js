const schedule = require('node-schedule');
const db = require('../db');
const interviewService = require('./interview.service');
const knowledgeAssetService = require('./knowledge-asset.service');
const monthlyReportService = require('./monthly-report.service');
const { formatDate, daysBetween } = require('../utils/date');
const config = require('../config');

function startSchedulers() {
  console.log('启动定时调度器...');

  const monthlyJob = schedule.scheduleJob('0 0 1 * *', async function() {
    console.log('执行月度报告生成任务...');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    try {
      await monthlyReportService.generateMonthlyReport(
        year, month, 'system', '系统自动'
      );
      console.log(`月度报告生成完成：${year}年${month}月`);
    } catch (error) {
      console.error('月度报告生成失败:', error);
    }
  });

  const reminderJob = schedule.scheduleJob('0 9 * * *', function() {
    console.log('执行每日催办检查任务...');
    try {
      processInterviewReminders();
      processKnowledgeTransferReminders();
      console.log('每日催办检查完成');
    } catch (error) {
      console.error('催办检查失败:', error);
    }
  });

  console.log('定时调度器启动完成');
  return { monthlyJob, reminderJob };
}

function processInterviewReminders() {
  db.initDatabase();
  const now = formatDate(new Date());

  const pendingInterviews = db.filter('interviews', i => 
    (i.status === 'scheduled' || i.status === 'rejected') &&
    i.employee_accepted === 1 &&
    i.escalated === 0
  );

  pendingInterviews.forEach(interview => {
    if (!interview.last_reminder_at && interview.scheduled_at < now) {
      interviewService.remindInterview(interview.id);
      return;
    }

    if (interview.last_reminder_at) {
      const daysSinceReminder = daysBetween(now, interview.last_reminder_at);
      if (daysSinceReminder >= config.interview.remindIntervalDays && 
          interview.reminder_count < config.interview.maxReminders) {
        interviewService.remindInterview(interview.id);
      }
    }
  });
}

function processKnowledgeTransferReminders() {
  db.initDatabase();
  const now = formatDate(new Date());

  const pendingTasks = db.filter('knowledge_transfer_tasks', t =>
    t.status !== 'completed' && t.escalated === 0
  );

  pendingTasks.forEach(task => {
    if (task.deadline < now && !task.escalated) {
      knowledgeAssetService.escalateTransferTask(task.id);
      return;
    }

    if (task.last_reminder_at) {
      const daysSinceReminder = daysBetween(now, task.last_reminder_at);
      if (daysSinceReminder >= config.knowledgeTransfer.remindIntervalDays) {
        knowledgeAssetService.remindTransferTask(task.id);
      }
    }
  });
}

module.exports = {
  startSchedulers,
  processInterviewReminders,
  processKnowledgeTransferReminders
};
