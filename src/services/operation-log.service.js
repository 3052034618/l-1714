const db = require('../db');
const { logOperation, OperationType, ModuleType } = require('../utils/operation-log');

function enrichLog(log) {
  if (!log) return null;

  const department = log.department_id ? db.findById('departments', log.department_id) : null;

  return {
    ...log,
    department_name: department ? department.name : null
  };
}

function getOperationLogs(params = {}) {
  db.initDatabase();

  let list = db.findAll('operation_logs');

  if (params.module) {
    list = list.filter(item => item.module === params.module);
  }

  if (params.operation_type) {
    list = list.filter(item => item.operation_type === params.operation_type);
  }

  if (params.department_id) {
    list = list.filter(item => item.department_id === params.department_id);
  }

  if (params.operator_id) {
    list = list.filter(item => item.operator_id === params.operator_id);
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

  const pagedList = list.slice(offset, offset + pageSize).map(item => enrichLog(item));

  return {
    list: pagedList,
    total,
    page,
    pageSize
  };
}

function exportOperationLogs(params = {}) {
  db.initDatabase();

  let list = db.findAll('operation_logs');

  if (params.module) {
    list = list.filter(item => item.module === params.module);
  }

  if (params.operation_type) {
    list = list.filter(item => item.operation_type === params.operation_type);
  }

  if (params.department_id) {
    list = list.filter(item => item.department_id === params.department_id);
  }

  if (params.start_date) {
    list = list.filter(item => item.created_at >= params.start_date);
  }

  if (params.end_date) {
    list = list.filter(item => item.created_at <= params.end_date);
  }

  list = list.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return list.map(item => enrichLog(item));
}

function getLogStats(params = {}) {
  db.initDatabase();

  let list = db.findAll('operation_logs');

  if (params.start_date) {
    list = list.filter(item => item.created_at >= params.start_date);
  }

  if (params.end_date) {
    list = list.filter(item => item.created_at <= params.end_date);
  }

  const moduleMap = list.reduce((acc, item) => {
    acc[item.module] = (acc[item.module] || 0) + 1;
    return acc;
  }, {});

  const moduleStats = Object.entries(moduleMap)
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count);

  const operationMap = list.reduce((acc, item) => {
    acc[item.operation_type] = (acc[item.operation_type] || 0) + 1;
    return acc;
  }, {});

  const operationStats = Object.entries(operationMap)
    .map(([operation_type, count]) => ({ operation_type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    by_module: moduleStats,
    by_operation: operationStats
  };
}

module.exports = {
  getOperationLogs,
  exportOperationLogs,
  getLogStats,
  logOperation,
  OperationType,
  ModuleType
};
