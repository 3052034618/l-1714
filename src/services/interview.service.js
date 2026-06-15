const db = require('../db');
const { formatDate, addBusinessDays } = require('../utils/date');
const { logOperation, OperationType, ModuleType } = require('../utils/operation-log');
const config = require('../config');
const reminderService = require('./reminder.service');
const ticketService = require('./ticket.service');

function enrichInterview(interview) {
  if (!interview) return null;

  const employee = db.findById('employees', interview.employee_id);
  const department = employee && employee.department_id
    ? db.findById('departments', employee.department_id)
    : null;

  return {
    ...interview,
    employee_name: employee ? employee.name : null,
    employee_email: employee ? employee.email : null,
    position: employee ? employee.position : null,
    department_id: employee ? employee.department_id : null,
    department_name: department ? department.name : null
  };
}

function scheduleInterview(resignationId) {
  db.initDatabase();

  const resignation = db.findById('resignation_applications', resignationId);
  if (!resignation) {
    throw new Error('离职申请不存在');
  }

  const employee = db.findById('employees', resignation.employee_id);
  const department = employee && employee.department_id
    ? db.findById('departments', employee.department_id)
    : null;

  const resignationWithDetails = {
    ...resignation,
    employee_name: employee ? employee.name : null,
    position: employee ? employee.position : null,
    department_id: employee ? employee.department_id : null,
    department_name: department ? department.name : null
  };

  const existingInterview = db.findOne('interviews',
    item => item.resignation_id === resignationId && item.status !== 'cancelled'
  );

  if (existingInterview) {
    return getInterviewById(existingInterview.id);
  }

  const scheduledAt = addBusinessDays(resignation.approved_at || new Date(), config.interview.defaultDaysAfterResignation);

  const departments = db.findAll('departments');
  const hrDept = departments.find(d => d.name === '人力资源部');
  const employees = db.findAll('employees');
  const hrInterviewer = hrDept
    ? employees.find(e => e.department_id === hrDept.id && (e.role === 'hr' || e.role === 'hr_director'))
    : null;

  const interview = db.insert('interviews', {
    resignation_id: resignationId,
    employee_id: resignation.employee_id,
    interviewer_id: hrInterviewer ? hrInterviewer.id : null,
    interviewer_name: hrInterviewer ? hrInterviewer.name : null,
    scheduled_at: scheduledAt,
    status: 'scheduled'
  });

  generateInterviewQuestions(interview.id, resignationWithDetails.position, resignationWithDetails.department_id);

  logOperation({
    operationType: OperationType.CREATE,
    module: ModuleType.INTERVIEW,
    relatedId: interview.id,
    operatorId: 'system',
    operatorName: '系统自动',
    departmentId: resignationWithDetails.department_id,
    detail: `自动安排离职面谈，计划时间：${scheduledAt}`
  });

  return getInterviewById(interview.id);
}

function generateInterviewQuestions(interviewId, position, departmentId) {
  db.initDatabase();

  const questions = db.filter('interview_question_library', q =>
    q.is_active === 1 &&
    (q.position === null || q.position === undefined || q.position === position) &&
    (q.department_id === null || q.department_id === undefined || q.department_id === departmentId)
  ).sort((a, b) => {
    if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  const generalQuestions = db.filter('interview_question_library', q =>
    q.is_active === 1 &&
    (q.position === null || q.position === undefined) &&
    (q.department_id === null || q.department_id === undefined)
  ).sort((a, b) => {
    if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  const allQuestions = [...questions];
  generalQuestions.forEach(gq => {
    if (!allQuestions.find(q => q.question === gq.question)) {
      allQuestions.push(gq);
    }
  });

  allQuestions.forEach((q, index) => {
    db.insert('interview_question_items', {
      interview_id: interviewId,
      question_library_id: q.id,
      question_text: q.question,
      question_category: q.category,
      sort_order: index + 1
    });
  });

  return allQuestions;
}

function getInterviewById(id) {
  db.initDatabase();

  const interview = db.findById('interviews', id);
  if (!interview) return null;

  const enriched = enrichInterview(interview);

  const questions = db.filter('interview_question_items',
    item => item.interview_id === id
  ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  enriched.questions = questions;

  return enriched;
}

function getInterviewList(params = {}) {
  db.initDatabase();

  let list = db.findAll('interviews');

  if (params.department_id) {
    const employees = db.findAll('employees');
    const deptEmployeeIds = employees
      .filter(e => e.department_id === params.department_id)
      .map(e => e.id);
    list = list.filter(item => deptEmployeeIds.includes(item.employee_id));
  }

  if (params.status) {
    list = list.filter(item => item.status === params.status);
  }

  if (params.employee_id) {
    list = list.filter(item => item.employee_id === params.employee_id);
  }

  list = list.sort((a, b) => (b.scheduled_at || '').localeCompare(a.scheduled_at || ''));

  const total = list.length;
  const page = parseInt(params.page) || 1;
  const pageSize = parseInt(params.pageSize) || 20;
  const offset = (page - 1) * pageSize;

  const pagedList = list.slice(offset, offset + pageSize).map(item => enrichInterview(item));

  return {
    list: pagedList,
    total,
    page,
    pageSize
  };
}

function rejectInterview(interviewId, rejectReason, operatorId, operatorName) {
  db.initDatabase();

  const interview = getInterviewById(interviewId);
  if (!interview) {
    throw new Error('面谈记录不存在');
  }

  db.update('interviews', interviewId, {
    status: 'rejected',
    employee_accepted: 0,
    reject_reason: rejectReason
  });

  logOperation({
    operationType: OperationType.REJECT,
    module: ModuleType.INTERVIEW,
    relatedId: interviewId,
    operatorId,
    operatorName,
    departmentId: interview.department_id,
    detail: `员工拒绝面谈，原因：${rejectReason}`
  });

  reminderService.createReminder({
    relatedId: interviewId,
    relatedType: 'interview',
    recipientId: interview.interviewer_id,
    recipientEmail: null,
    reminderType: 'interview_rejected',
    content: `员工${interview.employee_name}拒绝了离职面谈，请跟进处理。拒绝原因：${rejectReason}`
  });

  return getInterviewById(interviewId);
}

function rescheduleInterview(interviewId, newScheduledAt, operatorId, operatorName) {
  db.initDatabase();

  const interview = getInterviewById(interviewId);
  if (!interview) {
    throw new Error('面谈记录不存在');
  }

  db.update('interviews', interviewId, {
    scheduled_at: newScheduledAt,
    status: 'scheduled'
  });

  logOperation({
    operationType: OperationType.UPDATE,
    module: ModuleType.INTERVIEW,
    relatedId: interviewId,
    operatorId,
    operatorName,
    departmentId: interview.department_id,
    detail: `重新安排面谈时间至：${newScheduledAt}`
  });

  return getInterviewById(interviewId);
}

function recordInterviewResult(interviewId, data) {
  db.initDatabase();

  const interview = getInterviewById(interviewId);
  if (!interview) {
    throw new Error('面谈记录不存在');
  }

  const now = formatDate(new Date());

  db.update('interviews', interviewId, {
    status: 'completed',
    actual_start_at: data.actual_start_at || now,
    actual_end_at: data.actual_end_at || now,
    recording_url: data.recording_url || null,
    summary: data.summary || null,
    feedback_category: data.feedback_category || null,
    key_points: data.key_points ? JSON.stringify(data.key_points) : null
  });

  if (data.answers && data.answers.length > 0) {
    data.answers.forEach(answer => {
      db.update('interview_question_items', answer.item_id, {
        answer: answer.answer
      });
    });
  }

  const keyInsights = analyzeInterviewFeedback(interviewId);

  ticketService.generateTicketsFromInterview(interviewId, keyInsights);

  logOperation({
    operationType: OperationType.COMPLETE,
    module: ModuleType.INTERVIEW,
    relatedId: interviewId,
    operatorId: data.operator_id,
    operatorName: data.operator_name,
    departmentId: interview.department_id,
    detail: '完成面谈记录，已生成改进工单'
  });

  return getInterviewById(interviewId);
}

function analyzeInterviewFeedback(interviewId) {
  db.initDatabase();

  const interview = getInterviewById(interviewId);
  const questions = interview.questions;

  const insights = {
    categories: {},
    keyPoints: [],
    sentiment: 'neutral'
  };

  questions.forEach(q => {
    if (q.answer) {
      if (!insights.categories[q.question_category]) {
        insights.categories[q.question_category] = [];
      }
      insights.categories[q.question_category].push({
        question: q.question_text,
        answer: q.answer
      });

      if (q.answer.length > 20) {
        const firstSentence = q.answer.substring(0, 50) + '...';
        insights.keyPoints.push(firstSentence);
      }
    }
  });

  const negativeKeywords = ['不满意', '不好', '差', '问题', '压力大', '累', '不满', '糟糕'];
  const positiveKeywords = ['满意', '好', '棒', '优秀', '感谢', '开心', '不错'];

  let negativeCount = 0;
  let positiveCount = 0;

  questions.forEach(q => {
    if (q.answer) {
      negativeKeywords.forEach(kw => {
        if (q.answer.includes(kw)) negativeCount++;
      });
      positiveKeywords.forEach(kw => {
        if (q.answer.includes(kw)) positiveCount++;
      });
    }
  });

  if (negativeCount > positiveCount) {
    insights.sentiment = 'negative';
  } else if (positiveCount > negativeCount) {
    insights.sentiment = 'positive';
  }

  return insights;
}

function remindInterview(interviewId) {
  db.initDatabase();

  const interview = getInterviewById(interviewId);
  if (!interview) {
    throw new Error('面谈记录不存在');
  }

  const newCount = (interview.reminder_count || 0) + 1;
  const now = formatDate(new Date());

  db.update('interviews', interviewId, {
    reminder_count: newCount,
    last_reminder_at: now
  });

  reminderService.createReminder({
    relatedId: interviewId,
    relatedType: 'interview',
    recipientId: interview.employee_id,
    recipientEmail: interview.employee_email,
    reminderType: 'interview_reminder',
    content: `请确认并参加您的离职面谈，时间：${interview.scheduled_at}。这是第${newCount}次提醒。`
  });

  logOperation({
    operationType: OperationType.REMIND,
    module: ModuleType.INTERVIEW,
    relatedId: interviewId,
    operatorId: 'system',
    operatorName: '系统自动',
    departmentId: interview.department_id,
    detail: `第${newCount}次面谈催办`
  });

  if (newCount >= config.interview.maxReminders && !interview.escalated) {
    escalateInterview(interviewId);
  }

  return getInterviewById(interviewId);
}

function escalateInterview(interviewId) {
  db.initDatabase();

  const interview = getInterviewById(interviewId);
  if (!interview) {
    throw new Error('面谈记录不存在');
  }

  const now = formatDate(new Date());
  const hrDirector = db.findOne('employees', e => e.role === config.interview.escalationRole);

  db.update('interviews', interviewId, {
    escalated: 1,
    escalated_at: now
  });

  if (hrDirector) {
    reminderService.createReminder({
      relatedId: interviewId,
      relatedType: 'interview',
      recipientId: hrDirector.id,
      recipientEmail: hrDirector.email,
      reminderType: 'interview_escalation',
      content: `离职面谈已催办${config.interview.maxReminders}次，员工仍未回应，请HR总监介入处理。员工：${interview.employee_name}`
    });
  }

  logOperation({
    operationType: OperationType.ESCALATE,
    module: ModuleType.INTERVIEW,
    relatedId: interviewId,
    operatorId: 'system',
    operatorName: '系统自动',
    departmentId: interview.department_id,
    detail: '面谈催办超限，升级至HR总监'
  });

  return getInterviewById(interviewId);
}

function getInterviewsByStatus(status) {
  db.initDatabase();
  return db.filter('interviews', item => item.status === status);
}

module.exports = {
  scheduleInterview,
  generateInterviewQuestions,
  getInterviewById,
  getInterviewList,
  rejectInterview,
  rescheduleInterview,
  recordInterviewResult,
  analyzeInterviewFeedback,
  remindInterview,
  escalateInterview,
  getInterviewsByStatus
};
