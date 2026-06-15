const db = require('../db');
const { formatDate } = require('../utils/date');
const { logOperation, OperationType, ModuleType } = require('../utils/operation-log');
const ticketService = require('./ticket.service');
const knowledgeAssetService = require('./knowledge-asset.service');

function generateExitReport(resignationId, operatorId, operatorName) {
  db.initDatabase();

  const resignation = db.findById('resignation_applications', resignationId);
  if (!resignation) {
    throw new Error('离职申请不存在');
  }

  const employee = db.findById('employees', resignation.employee_id);
  const department = resignation.department_id ? db.findById('departments', resignation.department_id) : null;

  const interview = db.findOne('interviews', item => 
    item.resignation_id === resignationId && item.status === 'completed'
  );

  const interviewInfo = interview ? {
    scheduled_at: interview.scheduled_at,
    actual_start_at: interview.actual_start_at,
    actual_end_at: interview.actual_end_at,
    summary: interview.summary,
    feedback_category: interview.feedback_category,
    key_points: interview.key_points
  } : null;

  const tickets = ticketService.getTicketList({ resignation_id: resignationId, pageSize: 100 });
  const ticketStats = ticketService.getTicketStats(resignation.department_id);

  const knowledgeAssets = knowledgeAssetService.getKnowledgeAssets({ resignation_id: resignationId });
  const transferStats = knowledgeAssetService.getKnowledgeTransferStats(resignation.department_id);

  const report = {
    resignation: {
      employee_name: employee ? employee.name : null,
      department: department ? department.name : null,
      position: employee ? employee.position : null,
      level: employee ? employee.level : null,
      hire_date: employee ? employee.hire_date : null,
      resignation_date: resignation.resignation_date,
      last_working_date: resignation.last_working_date,
      reason: resignation.reason,
      reason_category: resignation.reason_category,
      status: resignation.status
    },
    interview: interviewInfo,
    tickets: {
      total: tickets.total,
      list: tickets.list,
      stats: ticketStats
    },
    knowledge_transfer: {
      total_assets: knowledgeAssets.length,
      assets: knowledgeAssets,
      completion_rate: transferStats.completionRate,
      stats: transferStats
    },
    generated_at: formatDate(new Date())
  };

  const reportId = saveReportRecord({
    report_type: 'exit',
    title: `${employee ? employee.name : ''} - 离职报告`,
    description: `离职日期：${resignation.last_working_date}`,
    period: null,
    department_id: resignation.department_id,
    file_path: null,
    file_format: 'json',
    generated_by: operatorId
  });

  logOperation({
    operationType: OperationType.GENERATE,
    module: ModuleType.REPORT,
    relatedId: reportId,
    operatorId,
    operatorName,
    departmentId: resignation.department_id,
    detail: `生成离职报告：${employee ? employee.name : ''}`
  });

  return {
    report_id: reportId,
    ...report
  };
}

function saveReportRecord(data) {
  db.initDatabase();

  const record = db.insert('reports', {
    report_type: data.report_type,
    title: data.title,
    description: data.description || null,
    period: data.period || null,
    department_id: data.department_id || null,
    file_path: data.file_path || null,
    file_format: data.file_format || 'json',
    generated_by: data.generated_by || null
  });

  return record.id;
}

function enrichReport(report) {
  if (!report) return null;

  const department = report.department_id ? db.findById('departments', report.department_id) : null;

  return {
    ...report,
    department_name: department ? department.name : null
  };
}

function getReportList(params = {}) {
  db.initDatabase();

  let list = db.findAll('reports');

  if (params.report_type) {
    list = list.filter(item => item.report_type === params.report_type);
  }

  if (params.department_id) {
    list = list.filter(item => item.department_id === params.department_id);
  }

  list = list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  list = list.slice(0, 100);

  return list.map(item => enrichReport(item));
}

function getReportById(id) {
  db.initDatabase();
  const report = db.findById('reports', id);
  return enrichReport(report);
}

module.exports = {
  generateExitReport,
  saveReportRecord,
  getReportList,
  getReportById
};
