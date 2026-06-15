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
      const result = runDailyReminders();
      console.log(`每日催办检查完成，处理了 ${result.interviewReminders} 个面谈提醒，${result.ktReminders} 个知识转移提醒`);
    } catch (error) {
      console.error('催办检查失败:', error);
    }
  });

  console.log('定时调度器启动完成');
  return { monthlyJob, reminderJob };
}

function runDailyReminders() {
  db.initDatabase();
  
  const interviewResult = processInterviewReminders();
  const ktResult = processKnowledgeTransferReminders();

  return {
    interviewReminders: interviewResult,
    ktReminders: ktResult
  };
}

function processInterviewReminders() {
  db.initDatabase();
  const now = formatDate(new Date());
  let reminderCount = 0;

  const pendingInterviews = db.filter('interviews', i => 
    i.status === 'scheduled' &&
    i.escalated !== 1
  );

  pendingInterviews.forEach(interview => {
    let shouldRemind = false;

    if (!interview.last_reminder_at && interview.scheduled_at < now) {
      shouldRemind = true;
    }

    if (interview.last_reminder_at) {
      const daysSinceReminder = daysBetween(now, interview.last_reminder_at);
      if (daysSinceReminder >= config.interview.remindIntervalDays && 
          (interview.reminder_count || 0) < config.interview.maxReminders) {
        shouldRemind = true;
      }
    }

    if (shouldRemind && !interview.escalated) {
      interviewService.remindInterview(interview.id);
      reminderCount++;
    }
  });

  const rejectedInterviews = db.filter('interviews', i => 
    i.status === 'rejected' &&
    i.escalated !== 1
  );

  rejectedInterviews.forEach(interview => {
    let shouldRemind = false;

    if (!interview.last_reject_reminder_at) {
      shouldRemind = true;
    }

    if (interview.last_reject_reminder_at) {
      const daysSinceReminder = daysBetween(now, interview.last_reject_reminder_at);
      if (daysSinceReminder >= config.interview.remindIntervalDays && 
          (interview.reject_reminder_count || 0) < config.interview.maxReminders) {
        shouldRemind = true;
      }
    }

    if (shouldRemind && !interview.escalated) {
      interviewService.remindInterview(interview.id);
      reminderCount++;
    }
  });

  return reminderCount;
}

function processKnowledgeTransferReminders() {
  db.initDatabase();
  const now = formatDate(new Date());
  let reminderCount = 0;

  const pendingTasks = db.filter('knowledge_transfer_tasks', t =>
    t.status !== 'completed' && t.escalated !== 1
  );

  pendingTasks.forEach(task => {
    if (task.deadline < now && !task.escalated) {
      knowledgeAssetService.escalateTransferTask(task.id);
      reminderCount++;
      return;
    }

    if (task.last_reminder_at) {
      const daysSinceReminder = daysBetween(now, task.last_reminder_at);
      if (daysSinceReminder >= config.knowledgeTransfer.remindIntervalDays) {
        knowledgeAssetService.remindTransferTask(task.id);
        reminderCount++;
      }
    }
  });

  return reminderCount;
}

module.exports = {
  startSchedulers,
  runDailyReminders,
  processInterviewReminders,
  processKnowledgeTransferReminders
};
