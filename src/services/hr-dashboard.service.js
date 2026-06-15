const db = require('../db');
const { formatDate } = require('../utils/date');

function getHrDashboard(departmentId = null, filters = {}) {
  db.initDatabase();
  const now = formatDate(new Date());

  const pendingResignations = getPendingResignations(departmentId, filters);
  const pendingInterviews = getPendingInterviews(departmentId, filters);
  const rejectedInterviews = getRejectedInterviews(departmentId, filters);
  const overdueKnowledgeTransfers = getOverdueKnowledgeTransfers(departmentId, filters);
  const pendingTickets = getPendingTickets(departmentId, filters);

  const totalActionItems = 
    pendingResignations.count +
    pendingInterviews.count +
    rejectedInterviews.count +
    overdueKnowledgeTransfers.count +
    pendingTickets.count;

  const priorityView = buildPriorityView({
    pendingResignations,
    pendingInterviews,
    rejectedInterviews,
    overdueKnowledgeTransfers,
    pendingTickets
  });

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
    },
    priority_view: priorityView
  };
}

function getMyTodos(userId) {
  db.initDatabase();

  const user = db.findById('employees', userId);
  if (!user) {
    throw new Error('用户不存在');
  }

  const filters = {};
  const scopeInfo = { user_name: user.name, user_role: user.role, scope_description: '' };

  if (user.role === 'hr_director' || user.role === 'hr') {
    scopeInfo.scope_description = '全部范围（HR角色）';
    scopeInfo.scope_type = 'all';
  } else if (user.role === 'manager') {
    filters.manager_id = userId;
    scopeInfo.scope_description = `负责部门内员工事项`;
    scopeInfo.scope_type = 'manager';
    
    const managedDepts = db.filter('departments', d => d.manager_id === userId);
    if (managedDepts.length > 0) {
      scopeInfo.scope_description = `${managedDepts.map(d => d.name).join('、')} 部门内员工事项`;
      scopeInfo.managed_departments = managedDepts.map(d => ({ id: d.id, name: d.name }));
    }
  } else {
    const empDept = user.department_id ? db.findById('departments', user.department_id) : null;
    if (empDept && empDept.hrbp_id) {
      filters.hrbp_id = empDept.hrbp_id;
      scopeInfo.scope_description = `${empDept.name} 部门事项（通过HRBP关联）`;
      scopeInfo.scope_type = 'hrbp_scope';
    } else {
      scopeInfo.scope_description = '无管理范围';
      scopeInfo.scope_type = 'none';
    }
  }

  const hrbpDepts = db.filter('departments', d => d.hrbp_id === userId);
  if (hrbpDepts.length > 0 && !filters.hrbp_id) {
    filters.hrbp_id = userId;
    scopeInfo.scope_description = scopeInfo.scope_description 
      ? `${scopeInfo.scope_description}；HRBP负责：${hrbpDepts.map(d => d.name).join('、')}`
      : `HRBP负责：${hrbpDepts.map(d => d.name).join('、')}`;
    scopeInfo.scope_type = scopeInfo.scope_type || 'hrbp';
    scopeInfo.hrbp_departments = hrbpDepts.map(d => ({ id: d.id, name: d.name }));
  }

  const pendingResignations = getPendingResignations(null, filters);
  const pendingInterviews = getPendingInterviews(null, filters);
  const rejectedInterviews = getRejectedInterviews(null, filters);
  const overdueKnowledgeTransfers = getOverdueKnowledgeTransfers(null, filters);
  const pendingTickets = getPendingTickets(null, filters);

  const allItems = [];

  pendingResignations.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'pending_resignation',
      type_name: '待审批离职',
      employee_name: item.employee_name,
      department_name: item.department_name,
      deadline: item.last_working_date,
      next_action: '审批离职申请',
      urgency_level: item.days_pending > 5 ? 'overdue' : item.days_pending > 3 ? 'due_soon' : 'normal'
    });
  });

  pendingInterviews.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'pending_interview',
      type_name: '待面谈',
      employee_name: item.employee_name,
      department_name: item.department_name,
      deadline: item.scheduled_at,
      next_action: '安排或跟进面谈',
      urgency_level: item.days_until_scheduled !== null && item.days_until_scheduled <= 0 ? 'overdue' 
        : item.days_until_scheduled !== null && item.days_until_scheduled <= 1 ? 'due_today'
        : item.days_until_scheduled !== null && item.days_until_scheduled <= 3 ? 'due_soon' : 'normal'
    });
  });

  rejectedInterviews.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'rejected_interview',
      type_name: '拒绝后待回应',
      employee_name: item.employee_name,
      department_name: item.department_name,
      deadline: null,
      next_action: item.reminders_until_escalation <= 1 ? '即将升级至HR总监' : `继续催办（还剩${item.reminders_until_escalation}次）`,
      urgency_level: item.reminders_until_escalation <= 1 ? 'overdue' : 'due_soon'
    });
  });

  overdueKnowledgeTransfers.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'overdue_knowledge_transfer',
      type_name: '知识转移超期',
      employee_name: item.employee_name,
      department_name: item.department_name,
      deadline: item.deadline,
      next_action: '催办知识转移任务',
      urgency_level: 'overdue'
    });
  });

  pendingTickets.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'pending_ticket',
      type_name: '待处理工单',
      employee_name: item.employee_name,
      department_name: item.department_name,
      deadline: item.due_date,
      next_action: '处理改进工单',
      urgency_level: item.priority === 'high' ? 'due_soon' 
        : item.days_until_due !== null && item.days_until_due <= 0 ? 'overdue'
        : item.days_until_due !== null && item.days_until_due <= 1 ? 'due_today'
        : item.days_until_due !== null && item.days_until_due <= 3 ? 'due_soon' : 'normal'
    });
  });

  const urgencyOrder = { overdue: 0, due_today: 1, due_soon: 2, normal: 3 };
  allItems.sort((a, b) => {
    const ua = urgencyOrder[a.urgency_level] ?? 4;
    const ub = urgencyOrder[b.urgency_level] ?? 4;
    if (ua !== ub) return ua - ub;
    return 0;
  });

  const grouped = {
    overdue: { name: '已超期', items: allItems.filter(i => i.urgency_level === 'overdue') },
    due_today: { name: '今日处理', items: allItems.filter(i => i.urgency_level === 'due_today') },
    due_soon: { name: '三天内处理', items: allItems.filter(i => i.urgency_level === 'due_soon') },
    normal: { name: '常规', items: allItems.filter(i => i.urgency_level === 'normal') }
  };

  return {
    scope: scopeInfo,
    total: allItems.length,
    grouped,
    items: allItems
  };
}

function buildPriorityView(data) {
  const allItems = [];

  data.pendingResignations.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'pending_resignation',
      type_name: '待审批离职',
      urgency_level: getUrgencyLevel(null, item.days_pending, 'resignation'),
      sort_score: calculateSortScore(item, 'resignation')
    });
  });

  data.pendingInterviews.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'pending_interview',
      type_name: '待面谈',
      urgency_level: getUrgencyLevel(item.days_until_scheduled, null, 'interview'),
      sort_score: calculateSortScore(item, 'interview')
    });
  });

  data.rejectedInterviews.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'rejected_interview',
      type_name: '拒绝后待回应',
      urgency_level: getUrgencyLevel(item.reminders_until_escalation, item.days_since_rejected, 'rejected'),
      sort_score: calculateSortScore(item, 'rejected')
    });
  });

  data.overdueKnowledgeTransfers.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'overdue_knowledge_transfer',
      type_name: '知识转移超期',
      urgency_level: 'overdue',
      sort_score: calculateSortScore(item, 'kt_overdue')
    });
  });

  data.pendingTickets.records.forEach(item => {
    allItems.push({
      ...item,
      item_type: 'pending_ticket',
      type_name: '待处理工单',
      urgency_level: getUrgencyLevel(item.days_until_due, null, 'ticket', item.priority),
      sort_score: calculateSortScore(item, 'ticket')
    });
  });

  allItems.sort((a, b) => a.sort_score - b.sort_score);

  const urgencyLevels = {
    overdue: { name: '已超期', items: [] },
    due_today: { name: '今日到期', items: [] },
    due_soon: { name: '即将到期（3天内）', items: [] },
    normal: { name: '常规处理', items: [] }
  };

  allItems.forEach(item => {
    if (urgencyLevels[item.urgency_level]) {
      urgencyLevels[item.urgency_level].items.push(item);
    } else {
      urgencyLevels.normal.items.push(item);
    }
  });

  return {
    total: allItems.length,
    by_urgency: {
      overdue: {
        count: urgencyLevels.overdue.items.length,
        name: '已超期',
        items: urgencyLevels.overdue.items
      },
      due_today: {
        count: urgencyLevels.due_today.items.length,
        name: '今日到期',
        items: urgencyLevels.due_today.items
      },
      due_soon: {
        count: urgencyLevels.due_soon.items.length,
        name: '即将到期（3天内）',
        items: urgencyLevels.due_soon.items
      },
      normal: {
        count: urgencyLevels.normal.items.length,
        name: '常规处理',
        items: urgencyLevels.normal.items
      }
    },
    sorted_items: allItems
  };
}

function getUrgencyLevel(daysUntil, daysSince, type, priority) {
  if (type === 'kt_overdue' || (daysSince !== null && daysSince > 5)) {
    return 'overdue';
  }

  if (daysUntil !== null) {
    if (daysUntil <= 0) return 'overdue';
    if (daysUntil <= 1) return 'due_today';
    if (daysUntil <= 3) return 'due_soon';
  }

  if (type === 'ticket' && priority === 'high') {
    return 'due_soon';
  }

  if (type === 'rejected') {
    if (daysUntil !== null && daysUntil <= 1) return 'overdue';
  }

  return 'normal';
}

function calculateSortScore(item, type) {
  const urgencyScore = {
    'overdue': 0,
    'due_today': 100,
    'due_soon': 200,
    'normal': 300
  };

  let baseScore = 300;
  
  if (type === 'kt_overdue' || item.urgency_level === 'overdue') {
    baseScore = 0;
  } else if (item.urgency_level === 'due_today') {
    baseScore = 100;
  } else if (item.urgency_level === 'due_soon') {
    baseScore = 200;
  }

  const typePriority = {
    'pending_resignation': 0,
    'rejected_interview': 1,
    'kt_overdue': 2,
    'pending_interview': 3,
    'pending_ticket': 4,
    'ticket': 5
  };

  const typeScore = (typePriority[type] || 9) * 10;

  return baseScore + typeScore;
}

function getPendingResignations(departmentId, filters = {}) {
  let list = db.filter('resignation_applications', r => r.status === 'pending');

  if (departmentId) {
    list = list.filter(r => r.department_id === departmentId);
  }

  if (filters.manager_id) {
    list = list.filter(r => {
      const employee = db.findById('employees', r.employee_id);
      return employee && employee.manager_id === filters.manager_id;
    });
  }

  if (filters.hrbp_id) {
    list = list.filter(r => {
      const dept = r.department_id ? db.findById('departments', r.department_id) : null;
      return dept && dept.hrbp_id === filters.hrbp_id;
    });
  }

  list = list.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const records = list.slice(0, 10).map(r => {
    const employee = db.findById('employees', r.employee_id);
    const department = r.department_id ? db.findById('departments', r.department_id) : null;
    const manager = employee && employee.manager_id ? db.findById('employees', employee.manager_id) : null;
    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      position: employee ? employee.position : null,
      manager_name: manager ? manager.name : null,
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

function getPendingInterviews(departmentId, filters = {}) {
  let interviews = db.filter('interviews', i => 
    i.status === 'scheduled' && i.escalated !== 1
  );

  if (departmentId) {
    interviews = interviews.filter(i => {
      const employee = db.findById('employees', i.employee_id);
      return employee && employee.department_id === departmentId;
    });
  }

  if (filters.manager_id) {
    interviews = interviews.filter(i => {
      const employee = db.findById('employees', i.employee_id);
      return employee && employee.manager_id === filters.manager_id;
    });
  }

  if (filters.hrbp_id) {
    interviews = interviews.filter(i => {
      const employee = db.findById('employees', i.employee_id);
      const dept = employee && employee.department_id ? db.findById('departments', employee.department_id) : null;
      return dept && dept.hrbp_id === filters.hrbp_id;
    });
  }

  interviews = interviews.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const records = interviews.slice(0, 10).map(i => {
    const employee = db.findById('employees', i.employee_id);
    const department = employee && employee.department_id ? db.findById('departments', employee.department_id) : null;
    const manager = employee && employee.manager_id ? db.findById('employees', employee.manager_id) : null;
    const interviewer = i.interviewer_id ? db.findById('employees', i.interviewer_id) : null;
    return {
      id: i.id,
      resignation_id: i.resignation_id,
      employee_id: i.employee_id,
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      position: employee ? employee.position : null,
      manager_name: manager ? manager.name : null,
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

function getRejectedInterviews(departmentId, filters = {}) {
  let interviews = db.filter('interviews', i => 
    i.status === 'rejected' && i.escalated !== 1
  );

  if (departmentId) {
    interviews = interviews.filter(i => {
      const employee = db.findById('employees', i.employee_id);
      return employee && employee.department_id === departmentId;
    });
  }

  if (filters.manager_id) {
    interviews = interviews.filter(i => {
      const employee = db.findById('employees', i.employee_id);
      return employee && employee.manager_id === filters.manager_id;
    });
  }

  if (filters.hrbp_id) {
    interviews = interviews.filter(i => {
      const employee = db.findById('employees', i.employee_id);
      const dept = employee && employee.department_id ? db.findById('departments', employee.department_id) : null;
      return dept && dept.hrbp_id === filters.hrbp_id;
    });
  }

  interviews = interviews.sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  const records = interviews.slice(0, 10).map(i => {
    const employee = db.findById('employees', i.employee_id);
    const department = employee && employee.department_id ? db.findById('departments', employee.department_id) : null;
    const manager = employee && employee.manager_id ? db.findById('employees', employee.manager_id) : null;
    return {
      id: i.id,
      resignation_id: i.resignation_id,
      employee_id: i.employee_id,
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      position: employee ? employee.position : null,
      manager_name: manager ? manager.name : null,
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

function getOverdueKnowledgeTransfers(departmentId, filters = {}) {
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

  if (filters.manager_id) {
    tasks = tasks.filter(t => {
      const asset = db.findById('knowledge_assets', t.knowledge_asset_id);
      if (!asset || !asset.resignation_id) return false;
      const resignation = db.findById('resignation_applications', asset.resignation_id);
      if (!resignation) return false;
      const employee = db.findById('employees', resignation.employee_id);
      return employee && employee.manager_id === filters.manager_id;
    });
  }

  if (filters.hrbp_id) {
    tasks = tasks.filter(t => {
      const asset = db.findById('knowledge_assets', t.knowledge_asset_id);
      if (!asset || !asset.resignation_id) return false;
      const resignation = db.findById('resignation_applications', asset.resignation_id);
      if (!resignation || !resignation.department_id) return false;
      const dept = db.findById('departments', resignation.department_id);
      return dept && dept.hrbp_id === filters.hrbp_id;
    });
  }

  tasks = tasks.sort((a, b) => a.deadline.localeCompare(b.deadline));

  const records = tasks.slice(0, 10).map(t => {
    const asset = t.knowledge_asset_id ? db.findById('knowledge_assets', t.knowledge_asset_id) : null;
    const assignee = t.assignee_id ? db.findById('employees', t.assignee_id) : null;
    const resignation = asset && asset.resignation_id ? db.findById('resignation_applications', asset.resignation_id) : null;
    const employee = resignation && resignation.employee_id ? db.findById('employees', resignation.employee_id) : null;
    const department = resignation && resignation.department_id ? db.findById('departments', resignation.department_id) : null;
    const manager = employee && employee.manager_id ? db.findById('employees', employee.manager_id) : null;
    
    return {
      id: t.id,
      asset_id: t.knowledge_asset_id,
      asset_name: asset ? asset.name : null,
      asset_type: asset ? asset.asset_type : null,
      resignation_id: asset ? asset.resignation_id : null,
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      manager_name: manager ? manager.name : null,
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

function getPendingTickets(departmentId, filters = {}) {
  let tickets = db.filter('improvement_tickets', t =>
    t.status === 'open' || t.status === 'in_progress'
  );

  if (departmentId) {
    tickets = tickets.filter(t => t.department_id === departmentId);
  }

  if (filters.manager_id) {
    tickets = tickets.filter(t => {
      const interview = t.interview_id ? db.findById('interviews', t.interview_id) : null;
      if (!interview || !interview.employee_id) return false;
      const employee = db.findById('employees', interview.employee_id);
      return employee && employee.manager_id === filters.manager_id;
    });
  }

  if (filters.hrbp_id) {
    tickets = tickets.filter(t => {
      const dept = t.department_id ? db.findById('departments', t.department_id) : null;
      return dept && dept.hrbp_id === filters.hrbp_id;
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  tickets = tickets.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.created_at.localeCompare(b.created_at);
  });

  const records = tickets.slice(0, 10).map(t => {
    const interview = t.interview_id ? db.findById('interviews', t.interview_id) : null;
    const employee = interview && interview.employee_id ? db.findById('employees', interview.employee_id) : null;
    const department = t.department_id ? db.findById('departments', t.department_id) : null;
    const assignee = t.assignee_id ? db.findById('employees', t.assignee_id) : null;
    const manager = employee && employee.manager_id ? db.findById('employees', employee.manager_id) : null;
    
    return {
      id: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: t.status,
      source: t.source || 'manual',
      employee_name: employee ? employee.name : null,
      department_name: department ? department.name : null,
      manager_name: manager ? manager.name : null,
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
  getHrDashboard,
  getMyTodos
};
