const db = require('../db');
const { formatDate } = require('../utils/date');

function getHrDashboard(departmentId = null) {
  db.initDatabase();
  const now = formatDate(new Date());

  const pendingResignations = getPendingResignations(departmentId);
  const pendingInterviews = getPendingInterviews(departmentId);
  const rejectedInterviews = getRejectedInterviews(departmentId);
  const overdueKnowledgeTransfers = getOverdueKnowledgeTransfers(departmentId);
  const pendingTickets = getPendingTickets(departmentId);

  const totalActionItems = 
    pendingResignations.count +
    pendingInterviews.count +
    rejectedInterviews.count +
    overdueKnowledgeTransfers.count +
    pendingTickets.count;

  return {
    summary: {
      total_action_items: totalActionItems,
      pending_resignations: pendingResignations.count,
      pending_interviews: pendingInterviews.count,
      rejected_interviews: rejectedInterviews.count,
      overdue_knowledge_transfers: overdueKnowledgeTransfers.count,
      pending_tickets: pendingTickets.count,
      generated_at: now
    },
    groups: {
      pending_resignations: {
        name: '待审批离职申请',
        priority: 1,
        count: pendingResignations.count,
        records: pendingResignations.records
      },
      pending_interviews: {
        name: '待面谈',
        priority: 2,
        count: pendingInterviews.count,
        records: pendingInterviews.records
      },
      rejected_interviews: {
        name: '拒绝后待回应',
        priority: 3,
        count: rejectedInterviews.count,
        records: rejectedInterviews.records
      },
      overdue_knowledge_transfers: {
        name: '知识转移超期',
        priority: 4,
        count: overdueKnowledgeTransfers.count,
        records: overdueKnowledgeTransfers.records
      },
      pending_tickets: {
        name: '待处理工单',
        priority: 5,
        count: pendingTickets.count,
        records: pendingTickets.records
      }
    }
  };
}

function getPendingResignations(departmentId) {
  let list = db.filter('resignation_applications', r => r.status === 'pending');

  if (departmentId) {
    list = list.filter(r => r.department_id === departmentId);
  }

  list = list.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const records = list.slice(0, 5).map(r => {
    const employee = db.findById('employees', r.employee_id);
    const department = r.department_id ? db.findById('departments', r.department_id) : null;
    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      position: employee ? employee.position : null,
      resignation_date: r.resignation_date,
      last_working_date: r.last_working_date,
      reason: r.reason,
      reason_category: r.reason_category,
      created_at: r.created_at,
      days_pending: calculateDaysFromNow(r.created_at)
    };
  });

  return {
    count: list.length,
    records: records
  };
}

function getPendingInterviews(departmentId) {
  let interviews = db.filter('interviews', i => 
    i.status === 'scheduled' && i.escalated !== 1
  );

  if (departmentId) {
    interviews = interviews.filter(i => {
      const employee = db.findById('employees', i.employee_id);
      return employee && employee.department_id === departmentId;
    });
  }

  interviews = interviews.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const records = interviews.slice(0, 5).map(i => {
    const employee = db.findById('employees', i.employee_id);
    const department = employee && employee.department_id ? db.findById('departments', employee.department_id) : null;
    const interviewer = i.interviewer_id ? db.findById('employees', i.interviewer_id) : null;
    return {
      id: i.id,
      resignation_id: i.resignation_id,
      employee_id: i.employee_id,
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      position: employee ? employee.position : null,
      interviewer_name: interviewer ? interviewer.name : null,
      scheduled_at: i.scheduled_at,
      reminder_count: i.reminder_count || 0,
      last_reminder_at: i.last_reminder_at || null,
      days_until_scheduled: calculateDaysUntil(i.scheduled_at),
      escalated: i.escalated || false
    };
  });

  return {
    count: interviews.length,
    records: records
  };
}

function getRejectedInterviews(departmentId) {
  let interviews = db.filter('interviews', i => 
    i.status === 'rejected' && i.escalated !== 1
  );

  if (departmentId) {
    interviews = interviews.filter(i => {
      const employee = db.findById('employees', i.employee_id);
      return employee && employee.department_id === departmentId;
    });
  }

  interviews = interviews.sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  const records = interviews.slice(0, 5).map(i => {
    const employee = db.findById('employees', i.employee_id);
    const department = employee && employee.department_id ? db.findById('departments', employee.department_id) : null;
    return {
      id: i.id,
      resignation_id: i.resignation_id,
      employee_id: i.employee_id,
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      position: employee ? employee.position : null,
      reject_reason: i.reject_reason,
      reject_reminder_count: i.reject_reminder_count || 0,
      last_reject_reminder_at: i.last_reject_reminder_at || null,
      days_since_rejected: calculateDaysFromNow(i.updated_at),
      max_reminders: 3,
      reminders_until_escalation: 3 - (i.reject_reminder_count || 0),
      escalated: i.escalated || false
    };
  });

  return {
    count: interviews.length,
    records: records
  };
}

function getOverdueKnowledgeTransfers(departmentId) {
  const now = formatDate(new Date());
  let tasks = db.filter('knowledge_transfer_tasks', t =>
    t.status !== 'completed' && t.deadline < now
  );

  if (departmentId) {
    tasks = tasks.filter(t => {
      const asset = db.findById('knowledge_assets', t.knowledge_asset_id);
      if (!asset || !asset.resignation_id) return false;
      const resignation = db.findById('resignation_applications', asset.resignation_id);
      return resignation && resignation.department_id === departmentId;
    });
  }

  tasks = tasks.sort((a, b) => a.deadline.localeCompare(b.deadline));

  const records = tasks.slice(0, 5).map(t => {
    const asset = t.knowledge_asset_id ? db.findById('knowledge_assets', t.knowledge_asset_id) : null;
    const assignee = t.assignee_id ? db.findById('employees', t.assignee_id) : null;
    const resignation = asset && asset.resignation_id ? db.findById('resignation_applications', asset.resignation_id) : null;
    const employee = resignation && resignation.employee_id ? db.findById('employees', resignation.employee_id) : null;
    
    return {
      id: t.id,
      asset_id: t.knowledge_asset_id,
      asset_name: asset ? asset.name : null,
      asset_type: asset ? asset.asset_type : null,
      resignation_id: asset ? asset.resignation_id : null,
      employee_name: employee ? employee.name : null,
      assignee_name: assignee ? assignee.name : null,
      status: t.status,
      deadline: t.deadline,
      days_overdue: calculateDaysOverdue(t.deadline, now),
      escalated: t.escalated || false
    };
  });

  return {
    count: tasks.length,
    records: records
  };
}

function getPendingTickets(departmentId) {
  let tickets = db.filter('improvement_tickets', t =>
    t.status === 'open' || t.status === 'in_progress'
  );

  if (departmentId) {
    tickets = tickets.filter(t => t.department_id === departmentId);
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  tickets = tickets.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.created_at.localeCompare(b.created_at);
  });

  const records = tickets.slice(0, 5).map(t => {
    const interviewer = t.interview_id ? db.findById('interviews', t.interview_id) : null;
    const employee = interviewer && interviewer.employee_id ? db.findById('employees', interviewer.employee_id) : null;
    const department = t.department_id ? db.findById('departments', t.department_id) : null;
    const assignee = t.assignee_id ? db.findById('employees', t.assignee_id) : null;
    
    return {
      id: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: t.status,
      source: t.source || 'manual',
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      assignee_name: assignee ? assignee.name : null,
      due_date: t.due_date,
      days_until_due: calculateDaysUntil(t.due_date),
      created_at: t.created_at
    };
  });

  return {
    count: tickets.length,
    records: records
  };
}

function calculateDaysFromNow(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const date = new Date(dateStr.replace(/-/g, '/'));
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function calculateDaysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const date = new Date(dateStr.replace(/-/g, '/'));
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function calculateDaysOverdue(deadlineStr, nowStr) {
  if (!deadlineStr) return null;
  const deadline = new Date(deadlineStr.replace(/-/g, '/'));
  const now = new Date(nowStr.replace(/-/g, '/'));
  const diffTime = now.getTime() - deadline.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

module.exports = {
  getHrDashboard
};
