const db = require('../db');
const { formatDate, addDays, isOverdue } = require('../utils/date');
const { logOperation, OperationType, ModuleType } = require('../utils/operation-log');
const config = require('../config');
const reminderService = require('./reminder.service');

const ASSET_TYPES = [
  '项目文档',
  '技术文档',
  '代码仓库',
  '客户资料',
  '财务文件',
  '产品需求文档',
  '设计文件',
  '测试用例',
  '会议纪要',
  '培训材料',
  '其他'
];

const IMPORTANCE_LEVELS = ['high', 'medium', 'low'];

function enrichKnowledgeAsset(asset) {
  if (!asset) return null;

  const employee = db.findById('employees', asset.employee_id);
  const resignation = asset.resignation_id ? db.findById('resignation_applications', asset.resignation_id) : null;
  const department = resignation && resignation.department_id ? db.findById('departments', resignation.department_id) : null;

  return {
    ...asset,
    employee_name: employee ? employee.name : null,
    department_id: resignation ? resignation.department_id : null,
    department_name: department ? department.name : null
  };
}

function enrichTransferTask(task) {
  if (!task) return null;

  const asset = db.findById('knowledge_assets', task.knowledge_asset_id);
  const employee = asset ? db.findById('employees', asset.employee_id) : null;
  const resignation = task.resignation_id ? db.findById('resignation_applications', task.resignation_id) : null;
  const department = resignation && resignation.department_id ? db.findById('departments', resignation.department_id) : null;

  return {
    ...task,
    asset_name: asset ? asset.name : null,
    asset_type: asset ? asset.asset_type : null,
    importance: asset ? asset.importance : null,
    employee_name: employee ? employee.name : null,
    department_id: resignation ? resignation.department_id : null,
    department_name: department ? department.name : null
  };
}

function scanEmployeeAssets(resignationId) {
  db.initDatabase();

  const resignation = enrichResignationSimple(db.findById('resignation_applications', resignationId));

  if (!resignation) {
    throw new Error('离职申请不存在');
  }

  const existingAssets = db.filter('knowledge_assets', a => a.resignation_id === resignationId);

  if (existingAssets.length > 0) {
    return { scanned: false, reason: '已扫描过' };
  }

  const mockAssets = generateMockAssets(resignation);

  const assetIds = [];
  mockAssets.forEach(asset => {
    const inserted = db.insert('knowledge_assets', {
      employee_id: resignation.employee_id,
      resignation_id: resignationId,
      asset_type: asset.asset_type,
      name: asset.name,
      description: asset.description,
      location: asset.location,
      importance: asset.importance,
      status: 'pending_transfer'
    });
    assetIds.push(inserted.id);

    createTransferTask(inserted.id, resignationId, resignation.department_id);
  });

  logOperation({
    operationType: OperationType.CREATE,
    module: ModuleType.KNOWLEDGE_ASSET,
    relatedId: resignationId,
    operatorId: 'system',
    operatorName: '系统自动',
    departmentId: resignation.department_id,
    detail: `自动扫描知识资产，共发现 ${assetIds.length} 项待转移资产`
  });

  return { scanned: true, count: assetIds.length, assetIds };
}

function enrichResignationSimple(application) {
  if (!application) return null;

  const employee = db.findById('employees', application.employee_id);

  return {
    ...application,
    employee_name: employee ? employee.name : null,
    position: employee ? employee.position : null,
    department_id: application.department_id
  };
}

function generateMockAssets(resignation) {
  const assets = [];
  const position = resignation.position || '';

  if (position.includes('工程师') || position.includes('技术')) {
    assets.push(
      { asset_type: '代码仓库', name: '核心业务系统代码库', description: '包含主要业务逻辑的后端代码', location: 'git@github.com:company/core-system.git', importance: 'high' },
      { asset_type: '技术文档', name: '系统架构设计文档', description: '整体架构设计和技术选型说明', location: '内部wiki/架构组', importance: 'high' },
      { asset_type: '技术文档', name: 'API接口文档', description: '对外和内部API详细说明', location: '内部wiki/API文档', importance: 'medium' },
      { asset_type: '测试用例', name: '自动化测试脚本', description: '单元测试和集成测试代码', location: 'tests/automation', importance: 'medium' }
    );
  }

  if (position.includes('产品')) {
    assets.push(
      { asset_type: '产品需求文档', name: '产品路线图规划', description: '未来6个月产品规划', location: '内部wiki/产品部', importance: 'high' },
      { asset_type: '产品需求文档', name: '核心功能需求说明', description: '主要功能的PRD文档', location: '内部wiki/产品部/PRD', importance: 'high' },
      { asset_type: '设计文件', name: '产品原型设计稿', description: 'Axure原型设计文件', location: '共享盘/设计稿', importance: 'medium' }
    );
  }

  assets.push(
    { asset_type: '项目文档', name: '在研项目进度文档', description: '当前负责项目的进度和风险', location: '内部wiki/项目管理', importance: 'high' },
    { asset_type: '会议纪要', name: '历史会议记录', description: '参与的重要会议纪要归档', location: '共享盘/会议纪要', importance: 'low' },
    { asset_type: '培训材料', name: '新员工入职培训资料', description: '岗位相关培训材料', location: '内部wiki/培训中心', importance: 'medium' }
  );

  return assets;
}

function createTransferTask(assetId, resignationId, departmentId) {
  db.initDatabase();

  const asset = db.findById('knowledge_assets', assetId);
  if (!asset) {
    throw new Error('知识资产不存在');
  }

  const successor = findSuccessor(departmentId, asset.asset_type);

  const deadline = addDays(new Date(), config.knowledgeTransfer.defaultDeadlineDays);

  const task = db.insert('knowledge_transfer_tasks', {
    knowledge_asset_id: assetId,
    resignation_id: resignationId,
    assignee_id: successor ? successor.id : null,
    assignee_name: successor ? successor.name : '待分配',
    status: 'pending',
    deadline: deadline
  });

  if (successor) {
    db.update('knowledge_assets', assetId, {
      transfer_to_id: successor.id,
      transfer_to_name: successor.name
    });
  }

  return task.id;
}

function findSuccessor(departmentId, assetType) {
  db.initDatabase();

  const employees = db.filter('employees', e =>
    e.department_id === departmentId && e.status === 'active' && e.role === 'employee'
  );

  employees.sort((a, b) => b.hire_date.localeCompare(a.hire_date));

  return employees[0] || null;
}

function getKnowledgeAssets(params = {}) {
  db.initDatabase();

  let list = db.findAll('knowledge_assets');

  if (params.resignation_id) {
    list = list.filter(item => item.resignation_id === params.resignation_id);
  }

  if (params.employee_id) {
    list = list.filter(item => item.employee_id === params.employee_id);
  }

  if (params.status) {
    list = list.filter(item => item.status === params.status);
  }

  if (params.department_id) {
    list = list.filter(item => {
      const resignation = item.resignation_id ? db.findById('resignation_applications', item.resignation_id) : null;
      return resignation && resignation.department_id === params.department_id;
    });
  }

  list = list.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return list.map(item => enrichKnowledgeAsset(item));
}

function getTransferTasks(params = {}) {
  db.initDatabase();

  let list = db.findAll('knowledge_transfer_tasks');

  if (params.resignation_id) {
    list = list.filter(item => item.resignation_id === params.resignation_id);
  }

  if (params.assignee_id) {
    list = list.filter(item => item.assignee_id === params.assignee_id);
  }

  if (params.status) {
    list = list.filter(item => item.status === params.status);
  }

  list = list.sort((a, b) => a.deadline.localeCompare(b.deadline));

  return list.map(item => enrichTransferTask(item));
}

function completeTransferTask(taskId, notes, operatorId, operatorName) {
  db.initDatabase();
  const now = formatDate(new Date());

  const task = enrichTransferTask(db.findById('knowledge_transfer_tasks', taskId));

  if (!task) {
    throw new Error('转移任务不存在');
  }

  db.update('knowledge_transfer_tasks', taskId, {
    status: 'completed',
    completed_at: now,
    notes: notes || null
  });

  db.update('knowledge_assets', task.knowledge_asset_id, {
    status: 'transferred',
    verified_at: now
  });

  logOperation({
    operationType: OperationType.COMPLETE,
    module: ModuleType.KNOWLEDGE_TRANSFER,
    relatedId: taskId,
    operatorId,
    operatorName,
    departmentId: task.department_id,
    detail: '完成知识转移任务'
  });

  return task;
}

function remindTransferTask(taskId) {
  db.initDatabase();
  const now = formatDate(new Date());

  const task = enrichTransferTask(db.findById('knowledge_transfer_tasks', taskId));

  if (!task) {
    throw new Error('转移任务不存在');
  }

  const newCount = (task.reminder_count || 0) + 1;

  db.update('knowledge_transfer_tasks', taskId, {
    reminder_count: newCount,
    last_reminder_at: now
  });

  reminderService.createReminder({
    relatedId: taskId,
    relatedType: 'knowledge_transfer',
    recipientId: task.assignee_id,
    recipientEmail: null,
    reminderType: 'transfer_reminder',
    content: `请尽快完成知识转移任务：${task.asset_name}，截止日期：${task.deadline}。这是第${newCount}次提醒。`
  });

  logOperation({
    operationType: OperationType.REMIND,
    module: ModuleType.KNOWLEDGE_TRANSFER,
    relatedId: taskId,
    operatorId: 'system',
    operatorName: '系统自动',
    departmentId: task.department_id,
    detail: `第${newCount}次知识转移催办`
  });

  if (isOverdue(task.deadline) && !task.escalated) {
    escalateTransferTask(taskId);
  }

  return task;
}

function escalateTransferTask(taskId) {
  db.initDatabase();
  const now = formatDate(new Date());

  const taskData = db.findById('knowledge_transfer_tasks', taskId);
  if (!taskData) {
    throw new Error('转移任务不存在');
  }

  const task = enrichTransferTask(taskData);
  const resignation = task.resignation_id ? db.findById('resignation_applications', task.resignation_id) : null;
  const department = resignation && resignation.department_id ? db.findById('departments', resignation.department_id) : null;

  db.update('knowledge_transfer_tasks', taskId, {
    escalated: 1,
    escalated_at: now
  });

  if (department && department.manager_id) {
    reminderService.createReminder({
      relatedId: taskId,
      relatedType: 'knowledge_transfer',
      recipientId: department.manager_id,
      recipientEmail: null,
      reminderType: 'transfer_escalation',
      content: `知识转移任务已超期，请部门经理关注。资产：${task.asset_name}，负责人：${task.assignee_name}`
    });
  }

  logOperation({
    operationType: OperationType.ESCALATE,
    module: ModuleType.KNOWLEDGE_TRANSFER,
    relatedId: taskId,
    operatorId: 'system',
    operatorName: '系统自动',
    departmentId: task.department_id,
    detail: '知识转移任务超期，升级至部门经理'
  });

  return task;
}

function reassignTransferTask(taskId, assigneeId, assigneeName, operatorId, operatorName) {
  db.initDatabase();
  const now = formatDate(new Date());

  const task = enrichTransferTask(db.findById('knowledge_transfer_tasks', taskId));

  if (!task) {
    throw new Error('转移任务不存在');
  }

  db.update('knowledge_transfer_tasks', taskId, {
    assignee_id: assigneeId,
    assignee_name: assigneeName
  });

  db.update('knowledge_assets', task.knowledge_asset_id, {
    transfer_to_id: assigneeId,
    transfer_to_name: assigneeName
  });

  logOperation({
    operationType: OperationType.UPDATE,
    module: ModuleType.KNOWLEDGE_TRANSFER,
    relatedId: taskId,
    operatorId,
    operatorName,
    departmentId: task.department_id,
    detail: `重新分配知识转移任务给：${assigneeName}`
  });

  return task;
}

function getKnowledgeTransferStats(departmentId = null) {
  db.initDatabase();

  let tasks = db.findAll('knowledge_transfer_tasks');

  if (departmentId) {
    tasks = tasks.filter(task => {
      const asset = db.findById('knowledge_assets', task.knowledge_asset_id);
      if (!asset || !asset.resignation_id) return false;
      const resignation = db.findById('resignation_applications', asset.resignation_id);
      return resignation && resignation.department_id === departmentId;
    });
  }

  const result = {
    total: tasks.length,
    pending: 0,
    in_progress: 0,
    completed: 0,
    completionRate: 0
  };

  tasks.forEach(t => {
    if (result[t.status] !== undefined) {
      result[t.status]++;
    }
  });

  if (result.total > 0) {
    result.completionRate = Math.round((result.completed / result.total) * 100);
  }

  return result;
}

module.exports = {
  scanEmployeeAssets,
  getKnowledgeAssets,
  getTransferTasks,
  createTransferTask,
  completeTransferTask,
  remindTransferTask,
  escalateTransferTask,
  reassignTransferTask,
  getKnowledgeTransferStats,
  ASSET_TYPES,
  IMPORTANCE_LEVELS
};
