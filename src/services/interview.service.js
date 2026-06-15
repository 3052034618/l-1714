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

function matchPositionKeywords(position, questionPosition) {
  if (!questionPosition) return true;
  if (!position) return false;
  if (position === questionPosition) return true;

  const keywordMap = {
    '工程师': ['高级工程师', '后端工程师', '前端工程师', '全栈工程师', '测试工程师', '运维工程师', '算法工程师', '工程师'],
    '产品经理': ['高级产品经理', '产品经理', '产品专员', '产品助理'],
    '设计师': ['高级设计师', 'UI设计师', 'UX设计师', '视觉设计师', '交互设计师', '设计师'],
    '运营': ['高级运营', '内容运营', '用户运营', '活动运营', '运营专员', '运营'],
    '销售': ['高级销售', '销售经理', '销售专员', '销售代表', '销售']
  };

  for (const [keyword, variations] of Object.entries(keywordMap)) {
    if (questionPosition === keyword || questionPosition.includes(keyword)) {
      return variations.some(v => position.includes(v));
    }
  }

  return false;
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
    status: 'scheduled',
    employee_accepted: 1,
    reminder_count: 0,
    escalated: 0,
    reject_reminder_count: 0
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

  const allLibraryQuestions = db.filter('interview_question_library', q => q.is_active === 1);

  const matchedQuestions = [];

  allLibraryQuestions.forEach(q => {
    const positionMatch = matchPositionKeywords(position, q.position);
    const deptMatch = !q.department_id || q.department_id === departmentId;
    const isGeneral = !q.position && !q.department_id;

    if (isGeneral || (positionMatch && deptMatch) || (positionMatch && !q.department_id) || (!q.position && deptMatch)) {
      matchedQuestions.push(q);
    }
  });

  const uniqueQuestions = [];
  const seenQuestions = new Set();

  matchedQuestions.sort((a, b) => {
    const aIsGeneral = !a.position && !a.department_id;
    const bIsGeneral = !b.position && !b.department_id;
    if (aIsGeneral && !bIsGeneral) return 1;
    if (!aIsGeneral && bIsGeneral) return -1;

    if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  matchedQuestions.forEach(q => {
    if (!seenQuestions.has(q.question)) {
      seenQuestions.add(q.question);
      uniqueQuestions.push(q);
    }
  });

  uniqueQuestions.sort((a, b) => {
    if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  uniqueQuestions.forEach((q, index) => {
    db.insert('interview_question_items', {
      interview_id: interviewId,
      question_library_id: q.id,
      question_text: q.question,
      question_category: q.category,
      sort_order: index + 1,
      is_position_specific: q.position ? 1 : 0,
      is_department_specific: q.department_id ? 1 : 0
    });
  });

  return uniqueQuestions;
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

  if (interview.key_points) {
    try {
      enriched.key_points_parsed = JSON.parse(interview.key_points);
    } catch {
      enriched.key_points_parsed = [];
    }
  }

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
    reject_reason: rejectReason,
    reject_reminder_count: 0,
    last_reject_reminder_at: null
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
    status: 'scheduled',
    employee_accepted: 1,
    reject_reason: null
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

function analyzeRecording(recordingText) {
  const insights = {
    categories: {},
    keyPoints: [],
    sentiment: 'neutral',
    recording_summary: ''
  };

  if (!recordingText) return insights;

  const categoryKeywords = {
    '职业发展': ['晋升', '发展', '成长', '职业规划', '学习', '培训', '技能', '晋级', '上升空间', '职业'],
    '薪酬福利': ['工资', '薪资', '薪水', '福利', '奖金', '加薪', '待遇', '补贴', '公积金', '社保'],
    '工作环境': ['办公', '环境', '氛围', '公司文化', '文化', '设施', '食堂', '工位', '加班'],
    '团队协作': ['团队', '协作', '沟通', '同事', '部门', '配合', '流程', '效率'],
    '管理问题': ['管理', '领导', '上级', '经理', '总监', '决策', '制度', '流程', '公平'],
    '工作压力': ['压力', '累', '工作量', '996', '加班', '倦怠', '焦虑', '辛苦', '繁忙'],
    '家庭原因': ['家庭', '孩子', '老人', '照顾', '搬家', '异地', '回家', '父母']
  };

  const sentences = recordingText.split(/[。！？.!?\n]+/).filter(s => s.trim().length > 5);

  sentences.forEach(sentence => {
    const trimmedSentence = sentence.trim();
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      const matchedKeywords = keywords.filter(kw => trimmedSentence.includes(kw));
      if (matchedKeywords.length > 0) {
        if (!insights.categories[category]) {
          insights.categories[category] = [];
        }
        insights.categories[category].push({
          question: '录音分析提取',
          answer: trimmedSentence,
          matched_keywords: matchedKeywords
        });
      }
    }
  });

  const keySentences = sentences
    .filter(s => s.trim().length > 15)
    .slice(0, 5)
    .map(s => s.trim().substring(0, 80) + (s.trim().length > 80 ? '...' : ''));
  
  insights.keyPoints = keySentences;

  const negativeKeywords = ['不满意', '不好', '差', '问题', '压力大', '累', '不满', '糟糕', '失望', '难受', '不公平', '低', '少'];
  const positiveKeywords = ['满意', '好', '棒', '优秀', '感谢', '开心', '不错', '喜欢', '很好', '非常好', '成长', '收获'];

  let negativeCount = 0;
  let positiveCount = 0;

  negativeKeywords.forEach(kw => {
    if (recordingText.includes(kw)) negativeCount++;
  });
  positiveKeywords.forEach(kw => {
    if (recordingText.includes(kw)) positiveCount++;
  });

  if (negativeCount > positiveCount) {
    insights.sentiment = 'negative';
  } else if (positiveCount > negativeCount) {
    insights.sentiment = 'positive';
  }

  if (sentences.length > 0) {
    insights.recording_summary = sentences.slice(0, 3).join('。') + '。';
  }

  return insights;
}

function recordInterviewResult(interviewId, data) {
  db.initDatabase();

  const interview = getInterviewById(interviewId);
  if (!interview) {
    throw new Error('面谈记录不存在');
  }

  const now = formatDate(new Date());

  let summary = data.summary || null;
  let feedbackCategory = data.feedback_category || null;
  let keyPoints = data.key_points ? JSON.stringify(data.key_points) : null;

  if ((data.recording_text || data.recording_url) && (!data.answers || data.answers.length === 0)) {
    const recordingInsights = analyzeRecording(data.recording_text || '（录音内容，已转录为文本分析）');
    
    if (!summary && recordingInsights.recording_summary) {
      summary = recordingInsights.recording_summary;
    }
    
    if (!feedbackCategory && Object.keys(recordingInsights.categories).length > 0) {
      feedbackCategory = Object.keys(recordingInsights.categories)[0];
    }
    
    if (!keyPoints && recordingInsights.keyPoints.length > 0) {
      keyPoints = JSON.stringify(recordingInsights.keyPoints);
    }

    const questions = interview.questions;
    questions.forEach(q => {
      const categoryAnswers = recordingInsights.categories[q.question_category];
      if (categoryAnswers && categoryAnswers.length > 0) {
        const combinedAnswer = categoryAnswers.map(ca => ca.answer).join('；');
        db.update('interview_question_items', q.id, {
          answer: `【录音分析】${combinedAnswer.substring(0, 200)}`
        });
      }
    });
  }

  db.update('interviews', interviewId, {
    status: 'completed',
    actual_start_at: data.actual_start_at || now,
    actual_end_at: data.actual_end_at || now,
    recording_url: data.recording_url || null,
    recording_text: data.recording_text || null,
    summary: summary,
    feedback_category: feedbackCategory,
    key_points: keyPoints,
    is_recording_analysis: (data.recording_text || data.recording_url) ? 1 : 0
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
    detail: data.recording_text ? '完成面谈记录（含录音分析），已生成改进工单' : '完成面谈记录，已生成改进工单'
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
        if (!insights.keyPoints.includes(firstSentence)) {
          insights.keyPoints.push(firstSentence);
        }
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

  const isRejected = interview.status === 'rejected';
  const countField = isRejected ? 'reject_reminder_count' : 'reminder_count';
  const lastReminderField = isRejected ? 'last_reject_reminder_at' : 'last_reminder_at';
  
  const currentCount = interview[countField] || 0;
  const newCount = currentCount + 1;
  const now = formatDate(new Date());

  const updateData = {};
  updateData[countField] = newCount;
  updateData[lastReminderField] = now;
  db.update('interviews', interviewId, updateData);

  let reminderContent = '';
  let reminderType = '';
  
  if (isRejected) {
    reminderContent = `请确认是否参加离职面谈，您之前已拒绝面谈安排。我们可以重新安排时间。这是第${newCount}次提醒。`;
    reminderType = 'interview_reject_reminder';
  } else {
    reminderContent = `请确认并参加您的离职面谈，时间：${interview.scheduled_at}。这是第${newCount}次提醒。`;
    reminderType = 'interview_reminder';
  }

  reminderService.createReminder({
    relatedId: interviewId,
    relatedType: 'interview',
    recipientId: interview.employee_id,
    recipientEmail: interview.employee_email,
    reminderType: reminderType,
    content: reminderContent
  });

  logOperation({
    operationType: OperationType.REMIND,
    module: ModuleType.INTERVIEW,
    relatedId: interviewId,
    operatorId: 'system',
    operatorName: '系统自动',
    departmentId: interview.department_id,
    detail: `第${newCount}次${isRejected ? '拒绝后' : ''}面谈催办`
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
    const statusText = interview.status === 'rejected' ? '员工拒绝面谈并已催办' : '面谈已催办';
    reminderService.createReminder({
      relatedId: interviewId,
      relatedType: 'interview',
      recipientId: hrDirector.id,
      recipientEmail: hrDirector.email,
      reminderType: 'interview_escalation',
      content: `离职面谈${statusText}${config.interview.maxReminders}次，员工仍未回应，请HR总监介入处理。员工：${interview.employee_name}，部门：${interview.department_name}`
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
  analyzeRecording,
  remindInterview,
  escalateInterview,
  getInterviewsByStatus,
  matchPositionKeywords
};
