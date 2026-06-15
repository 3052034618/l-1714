const db = require('../db');
const { addDays } = require('../utils/date');
const { logOperation, OperationType, ModuleType } = require('../utils/operation-log');

function generateTicketsFromInterview(interviewId, insights, analysisSource) {
  db.initDatabase();

  const interview = db.findById('interviews', interviewId);
  if (!interview) {
    throw new Error('面谈记录不存在');
  }

  const employee = db.findById('employees', interview.employee_id);
  const department = employee && employee.department_id 
    ? db.findById('departments', employee.department_id) 
    : null;

  const interviewWithDept = {
    ...interview,
    department_id: employee ? employee.department_id : null,
    department_name: department ? department.name : null
  };

  const tickets = [];

  let sourceLabel = '';
  let sourcePrefix = '';
  if (analysisSource === 'recording_url') {
    sourceLabel = '（录音地址分析）';
    sourcePrefix = '【录音地址分析】';
  } else if (analysisSource === 'recording_text') {
    sourceLabel = '（录音文本分析）';
    sourcePrefix = '【录音文本分析】';
  }

  if (insights.categories) {
    Object.entries(insights.categories).forEach(([category, qaList]) => {
      const hasSignificantFeedback = qaList.some(
        qa => qa.answer && qa.answer.length > 10
      );

      if (hasSignificantFeedback) {
        const ticketId = createTicket({
          interview_id: interviewId,
          resignation_id: interview.resignation_id,
          title: `${sourcePrefix}【${category}】改进建议${sourceLabel}`,
          description: generateTicketDescription(category, qaList, analysisSource),
          category,
          priority: insights.sentiment === 'negative' ? 'high' : 'medium',
          department_id: interviewWithDept.department_id,
          source: analysisSource || 'manual'
        });

        tickets.push(ticketId);
      }
    });
  }

  if (insights.keyPoints && insights.keyPoints.length > 0) {
    const generalTicketId = createTicket({
      interview_id: interviewId,
      resignation_id: interview.resignation_id,
      title: `${sourcePrefix}离职面谈关键反馈汇总${sourceLabel}`,
      description: insights.keyPoints.join('\n\n'),
      category: '综合反馈',
      priority: 'medium',
      department_id: interviewWithDept.department_id,
      source: analysisSource || 'manual'
    });
    tickets.push(generalTicketId);
  }

  return tickets;
}

function generateTicketDescription(category, qaList, analysisSource) {
  let sourceNote = '';
  if (analysisSource === 'recording_url') {
    sourceNote = '> 来源：录音地址智能分析\n\n';
  } else if (analysisSource === 'recording_text') {
    sourceNote = '> 来源：录音文本关键词分析\n\n';
  }

  let description = `## ${category}相关反馈：\n\n${sourceNote}`;

  qaList.forEach((qa, index) => {
    if (qa.answer) {
      description += `**问题${index + 1}. ${qa.question}\n`;
      description += `回答：${qa.answer}\n\n`;
    }
  });

  return description;
}

function createTicket(data) {
  db.initDatabase();

  const dueDate = addDays(db.now(), 14);

  const ticket = db.insert('improvement_tickets', {
    interview_id: data.interview_id || null,
    resignation_id: data.resignation_id || null,
    title: data.title,
    description: data.description || null,
    category: data.category,
    priority: data.priority || 'medium',
    status: 'open',
    department_id: data.department_id || null,
    due_date: dueDate,
    assignee_id: null,
    assignee_name: null,
    completed_at: null,
    source: data.source || 'manual'
  });

  if (data.department_id) {
    const dept = db.findById('departments', data.department_id);
    if (dept && dept.manager_id) {
      const deptManager = db.findById('employees', dept.manager_id);
      if (deptManager) {
        db.update('improvement_tickets', ticket.id, {
          assignee_id: deptManager.id,
          assignee_name: deptManager.name
        });
      }
    }
  }

  logOperation({
    operationType: OperationType.CREATE,
    module: ModuleType.TICKET,
    relatedId: ticket.id,
    operatorId: 'system',
    operatorName: '系统自动',
    departmentId: data.department_id,
    detail: `自动生成改进工单：${data.title}`
  });

  return ticket.id;
}

function enrichTicket(ticket) {
  if (!ticket) return null;
  
  const department = ticket.department_id 
    ? db.findById('departments', ticket.department_id) 
    : null;
  
  return {
    ...ticket,
    department_name: department ? department.name : null
  };
}

function getTicketById(id) {
  db.initDatabase();
  const ticket = db.findById('improvement_tickets', id);
  return enrichTicket(ticket);
}

function getTicketList(params = {}) {
  db.initDatabase();

  let list = db.findAll('improvement_tickets');

  if (params.department_id) {
    list = list.filter(item => item.department_id === params.department_id);
  }

  if (params.status) {
    list = list.filter(item => item.status === params.status);
  }

  if (params.category) {
    list = list.filter(item => item.category === params.category);
  }

  if (params.assignee_id) {
    list = list.filter(item => item.assignee_id === params.assignee_id);
  }

  list = list.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = list.length;
  const page = parseInt(params.page) || 1;
  const pageSize = parseInt(params.pageSize) || 20;
  const offset = (page - 1) * pageSize;

  const pagedList = list.slice(offset, offset + pageSize).map(item => enrichTicket(item));

  return {
    list: pagedList,
    total,
    page,
    pageSize
  };
}

function updateTicketStatus(id, status, operatorId, operatorName) {
  db.initDatabase();

  const ticket = db.findById('improvement_tickets', id);
  if (!ticket) {
    throw new Error('工单不存在');
  }

  const updates = { status };
  if (status === 'completed') {
    updates.completed_at = db.now();
  }

  db.update('improvement_tickets', id, updates);

  logOperation({
    operationType: OperationType.UPDATE,
    module: ModuleType.TICKET,
    relatedId: id,
    operatorId,
    operatorName,
    departmentId: ticket.department_id,
    detail: `更新工单状态为：${status}`
  });

  return getTicketById(id);
}

function assignTicket(id, assigneeId, assigneeName, operatorId, operatorName) {
  db.initDatabase();

  const ticket = db.findById('improvement_tickets', id);
  if (!ticket) {
    throw new Error('工单不存在');
  }

  db.update('improvement_tickets', id, {
    assignee_id: assigneeId,
    assignee_name: assigneeName
  });

  logOperation({
    operationType: OperationType.UPDATE,
    module: ModuleType.TICKET,
    relatedId: id,
    operatorId,
    operatorName,
    departmentId: ticket.department_id,
    detail: `分配工单给：${assigneeName}`
  });

  return getTicketById(id);
}

function getTicketStats(departmentId = null, resignationId = null) {
  db.initDatabase();

  let tickets = db.findAll('improvement_tickets');

  if (departmentId) {
    tickets = tickets.filter(item => item.department_id === departmentId);
  }

  if (resignationId) {
    tickets = tickets.filter(item => item.resignation_id === resignationId);
  }

  const result = {
    total: tickets.length,
    open: 0,
    in_progress: 0,
    completed: 0,
    closed: 0
  };

  tickets.forEach(ticket => {
    if (result[ticket.status] !== undefined) {
      result[ticket.status]++;
    }
  });

  return result;
}

module.exports = {
  generateTicketsFromInterview,
  createTicket,
  getTicketById,
  getTicketList,
  updateTicketStatus,
  assignTicket,
  getTicketStats
};
