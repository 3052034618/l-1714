const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { formatDate, addDays, addBusinessDays } = require('../utils/date');
const { logOperation, OperationType, ModuleType } = require('../utils/operation-log');
const config = require('../config');

function createResignationApplication(data) {
  db.initDatabase();

  const employee = db.findById('employees', data.employee_id);
  if (!employee) {
    throw new Error('员工不存在');
  }

  const application = db.insert('resignation_applications', {
    employee_id: employee.id,
    department_id: employee.department_id,
    position: employee.position,
    resignation_date: data.resignation_date,
    last_working_date: data.last_working_date,
    reason: data.reason || null,
    reason_category: data.reason_category || null,
    status: 'pending',
    approver_id: null,
    approved_at: null
  });

  logOperation({
    operationType: OperationType.CREATE,
    module: ModuleType.RESIGNATION,
    relatedId: application.id,
    operatorId: data.operator_id || employee.id,
    operatorName: data.operator_name || employee.name,
    departmentId: employee.department_id,
    detail: `提交离职申请，离职日期：${data.last_working_date}`
  });

  return enrichResignation(application);
}

function enrichResignation(application) {
  if (!application) return null;
  
  const employee = db.findById('employees', application.employee_id);
  const department = application.department_id ? db.findById('departments', application.department_id) : null;
  
  return {
    ...application,
    employee_name: employee ? employee.name : null,
    employee_email: employee ? employee.email : null,
    department_name: department ? department.name : null
  };
}

function approveResignation(id, approverId, approverName) {
  db.initDatabase();

  const application = db.findById('resignation_applications', id);
  if (!application) {
    throw new Error('离职申请不存在');
  }

  if (application.status !== 'pending') {
    throw new Error('申请状态不允许审批');
  }

  const now = formatDate(new Date());
  const updated = db.update('resignation_applications', id, {
    status: 'approved',
    approver_id: approverId,
    approved_at: now
  });

  const interviewService = require('./interview.service');
  const knowledgeAssetService = require('./knowledge-asset.service');
  
  interviewService.scheduleInterview(id);
  knowledgeAssetService.scanEmployeeAssets(id);

  logOperation({
    operationType: OperationType.APPROVE,
    module: ModuleType.RESIGNATION,
    relatedId: id,
    operatorId: approverId,
    operatorName: approverName,
    departmentId: application.department_id,
    detail: '审批通过离职申请，已自动安排面谈并扫描知识资产'
  });

  return enrichResignation(db.findById('resignation_applications', id));
}

function rejectResignation(id, rejectReason, operatorId, operatorName) {
  db.initDatabase();

  const application = db.findById('resignation_applications', id);
  if (!application) {
    throw new Error('离职申请不存在');
  }

  db.update('resignation_applications', id, {
    status: 'rejected'
  });

  logOperation({
    operationType: OperationType.REJECT,
    module: ModuleType.RESIGNATION,
    relatedId: id,
    operatorId,
    operatorName,
    departmentId: application.department_id,
    detail: `拒绝离职申请，原因：${rejectReason}`
  });

  return enrichResignation(db.findById('resignation_applications', id));
}

function getResignationById(id) {
  db.initDatabase();
  const application = db.findById('resignation_applications', id);
  return enrichResignation(application);
}

function getResignationList(params = {}) {
  db.initDatabase();

  let list = db.findAll('resignation_applications');

  if (params.department_id) {
    list = list.filter(item => item.department_id === params.department_id);
  }

  if (params.status) {
    list = list.filter(item => item.status === params.status);
  }

  if (params.employee_id) {
    list = list.filter(item => item.employee_id === params.employee_id);
  }

  if (params.start_date) {
    list = list.filter(item => item.created_at >= params.start_date);
  }

  if (params.end_date) {
    list = list.filter(item => item.created_at <= params.end_date);
  }

  list = list.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = list.length;
  const page = parseInt(params.page) || 1;
  const pageSize = parseInt(params.pageSize) || 20;
  const offset = (page - 1) * pageSize;

  const pagedList = list.slice(offset, offset + pageSize).map(item => enrichResignation(item));

  return {
    list: pagedList,
    total,
    page,
    pageSize
  };
}

function completeResignation(id, operatorId, operatorName) {
  db.initDatabase();

  const application = db.findById('resignation_applications', id);
  if (!application) {
    throw new Error('离职申请不存在');
  }

  db.update('resignation_applications', id, {
    status: 'completed'
  });

  db.update('employees', application.employee_id, {
    status: 'resigned'
  });

  logOperation({
    operationType: OperationType.COMPLETE,
    module: ModuleType.RESIGNATION,
    relatedId: id,
    operatorId,
    operatorName,
    departmentId: application.department_id,
    detail: '完成离职流程'
  });

  return enrichResignation(db.findById('resignation_applications', id));
}

module.exports = {
  createResignationApplication,
  approveResignation,
  rejectResignation,
  getResignationById,
  getResignationList,
  completeResignation
};
