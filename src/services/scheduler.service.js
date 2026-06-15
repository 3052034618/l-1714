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
      console.log(`每日催办检查完成：`);
      console.log(`  - 面谈提醒：${result.interview.summary.total} 个`);
      console.log(`    - 待确认：${result.interview.summary.scheduled} 个`);
      console.log(`    - 拒绝后待回应：${result.interview.summary.rejected} 个`);
      console.log(`    - 已升级：${result.interview.summary.escalated} 个`);
      console.log(`  - 知识转移提醒：${result.knowledgeTransfer.summary.total} 个`);
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
    interview: interviewResult,
    knowledgeTransfer: ktResult,
    timestamp: formatDate(new Date())
  };
}

function processInterviewReminders() {
  db.initDatabase();
  const now = formatDate(new Date());
  
  const result = {
    summary: {
      total: 0,
      scheduled: 0,
      rejected: 0,
      escalated: 0,
      newly_escalated: 0
    },
    details: []
  };

  const scheduledInterviews = db.filter('interviews', i => 
    i.status === 'scheduled' && i.escalated !== 1
  );

  scheduledInterviews.forEach(interview => {
    const employee = db.findById('employees', interview.employee_id);
    let shouldRemind = false;
    let reminderNumber = (interview.reminder_count || 0) + 1;

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

    const willEscalate = shouldRemind && reminderNumber >= config.interview.maxReminders;

    if (shouldRemind && !interview.escalated) {
      const updated = interviewService.remindInterview(interview.id);
      result.summary.total++;
      result.summary.scheduled++;
      if (updated && updated.escalated) {
        result.summary.escalated++;
        result.summary.newly_escalated++;
      }

      result.details.push({
        interview_id: interview.id,
        employee_name: employee ? employee.name : null,
        employee_position: employee ? employee.position : null,
        type: 'scheduled',
        status: '待员工确认',
        reminder_number: reminderNumber,
        max_reminders: config.interview.maxReminders,
        last_reminder_at: interview.last_reminder_at || null,
        this_reminder_at: now,
        scheduled_at: interview.scheduled_at,
        will_escalate: willEscalate,
        escalated: updated ? updated.escalated : false,
        escalation_at: updated && updated.escalated ? now : null,
        employee_responded: false,
        response_deadline: null,
        days_until_escalation: config.interview.maxReminders - reminderNumber,
        action: willEscalate ? '已发送提醒并升级至HR总监' : '已发送催办提醒'
      });
    } else {
      result.details.push({
        interview_id: interview.id,
        employee_name: employee ? employee.name : null,
        employee_position: employee ? employee.position : null,
        type: 'scheduled',
        status: '待员工确认',
        reminder_number: interview.reminder_count || 0,
        max_reminders: config.interview.maxReminders,
        last_reminder_at: interview.last_reminder_at || null,
        scheduled_at: interview.scheduled_at,
        escalated: interview.escalated || false,
        employee_responded: false,
        action: '未达到催办条件'
      });
    }
  });

  const rejectedInterviews = db.filter('interviews', i => 
    i.status === 'rejected' && i.escalated !== 1
  );

  rejectedInterviews.forEach(interview => {
    const employee = db.findById('employees', interview.employee_id);
    let shouldRemind = false;
    let reminderNumber = (interview.reject_reminder_count || 0) + 1;

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

    const willEscalate = shouldRemind && reminderNumber >= config.interview.maxReminders;

    if (shouldRemind && !interview.escalated) {
      const updated = interviewService.remindInterview(interview.id);
      result.summary.total++;
      result.summary.rejected++;
      if (updated && updated.escalated) {
        result.summary.escalated++;
        result.summary.newly_escalated++;
      }

      result.details.push({
        interview_id: interview.id,
        employee_name: employee ? employee.name : null,
        employee_position: employee ? employee.position : null,
        type: 'rejected',
        status: '拒绝后待回应',
        reject_reason: interview.reject_reason || null,
        reminder_number: reminderNumber,
        max_reminders: config.interview.maxReminders,
        last_reminder_at: interview.last_reject_reminder_at || null,
        this_reminder_at: now,
        will_escalate: willEscalate,
        escalated: updated ? updated.escalated : false,
        escalation_at: updated && updated.escalated ? now : null,
        employee_responded: false,
        days_until_escalation: config.interview.maxReminders - reminderNumber,
        action: willEscalate ? '已发送提醒并升级至HR总监' : '已发送催办提醒（拒绝后）'
      });
    } else {
      result.details.push({
        interview_id: interview.id,
        employee_name: employee ? employee.name : null,
        employee_position: employee ? employee.position : null,
        type: 'rejected',
        status: '拒绝后待回应',
        reject_reason: interview.reject_reason || null,
        reminder_number: interview.reject_reminder_count || 0,
        max_reminders: config.interview.maxReminders,
        last_reminder_at: interview.last_reject_reminder_at || null,
        escalated: interview.escalated || false,
        employee_responded: false,
        action: '未达到催办条件'
      });
    }
  });

  const respondedInterviews = db.filter('interviews', i => 
    i.status === 'confirmed' || i.status === 'completed' || i.status === 'rescheduled'
  );

  respondedInterviews.forEach(interview => {
    const employee = db.findById('employees', interview.employee_id);
    result.details.push({
      interview_id: interview.id,
      employee_name: employee ? employee.name : null,
      employee_position: employee ? employee.position : null,
      type: interview.status,
      status: '员工已回应',
      reminder_number: interview.reminder_count || 0,
      max_reminders: config.interview.maxReminders,
      escalated: interview.escalated || false,
      employee_responded: true,
      action: '无需催办'
    });
  });

  const escalatedInterviews = db.filter('interviews', i => i.escalated === 1);
  result.summary.escalated += escalatedInterviews.length;

  return result;
}

function processKnowledgeTransferReminders() {
  db.initDatabase();
  const now = formatDate(new Date());
  
  const result = {
    summary: {
      total: 0,
      reminded: 0,
      escalated: 0,
      newly_escalated: 0
    },
    details: []
  };

  const pendingTasks = db.filter('knowledge_transfer_tasks', t =>
    t.status !== 'completed'
  );

  pendingTasks.forEach(task => {
    const employee = task.assignee_id ? db.findById('employees', task.assignee_id) : null;
    const asset = task.knowledge_asset_id ? db.findById('knowledge_assets', task.knowledge_asset_id) : null;
    
    let action = '未处理';
    let wasReminded = false;
    let wasEscalated = false;

    if (task.deadline < now && !task.escalated) {
      knowledgeAssetService.escalateTransferTask(task.id);
      result.summary.total++;
      result.summary.escalated++;
      result.summary.newly_escalated++;
      wasEscalated = true;
      action = '已超期，升级至部门负责人';
    }

    if (task.last_reminder_at) {
      const daysSinceReminder = daysBetween(now, task.last_reminder_at);
      if (daysSinceReminder >= config.knowledgeTransfer.remindIntervalDays) {
        knowledgeAssetService.remindTransferTask(task.id);
        result.summary.total++;
        result.summary.reminded++;
        wasReminded = true;
        action = '已发送催办提醒';
      }
    }

    result.details.push({
      task_id: task.id,
      asset_name: asset ? asset.name : null,
      asset_type: asset ? asset.asset_type : null,
      assignee_name: employee ? employee.name : null,
      status: task.status,
      deadline: task.deadline,
      last_reminder_at: task.last_reminder_at || null,
      escalated: task.escalated || wasEscalated,
      was_reminded: wasReminded,
      was_escalated: wasEscalated,
      overdue: task.deadline < now,
      action: action
    });
  });

  return result;
}

module.exports = {
  startSchedulers,
  runDailyReminders,
  processInterviewReminders,
  processKnowledgeTransferReminders
};
