const db = require('../db');

function logOperation(options) {
  db.initDatabase();

  const {
    operationType,
    module,
    relatedId = null,
    operatorId = null,
    operatorName = null,
    departmentId = null,
    detail = null,
    ipAddress = null
  } = options;

  db.insert('operation_logs', {
    operation_type: operationType,
    module: module,
    related_id: relatedId,
    operator_id: operatorId,
    operator_name: operatorName,
    department_id: departmentId,
    detail: detail,
    ip_address: ipAddress
  });
}

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  REJECT: 'reject',
  COMPLETE: 'complete',
  ESCALATE: 'escalate',
  REMIND: 'remind',
  GENERATE: 'generate',
  EXPORT: 'export'
};

const ModuleType = {
  RESIGNATION: 'resignation',
  INTERVIEW: 'interview',
  TICKET: 'improvement_ticket',
  KNOWLEDGE_ASSET: 'knowledge_asset',
  KNOWLEDGE_TRANSFER: 'knowledge_transfer',
  REPORT: 'report',
  REMINDER: 'reminder'
};

module.exports = {
  logOperation,
  OperationType,
  ModuleType
};
