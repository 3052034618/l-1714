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

  const interviews = db.filter('interviews', item => 
    item.resignation_id === resignationId
  ).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const completedInterview = interviews.find(i => i.status === 'completed');

  const interviewInfo = completedInterview ? {
    interview_id: completedInterview.id,
    scheduled_at: completedInterview.scheduled_at,
    actual_start_at: completedInterview.actual_start_at,
    actual_end_at: completedInterview.actual_end_at,
    summary: completedInterview.summary,
    feedback_category: completedInterview.feedback_category,
    key_points: completedInterview.key_points,
    is_recording_analysis: completedInterview.is_recording_analysis,
    recording_analysis_source: completedInterview.recording_analysis_source,
    recording_url: completedInterview.recording_url
  } : null;

  const ticketParams = { resignation_id: resignationId, pageSize: 100 };
  const tickets = ticketService.getTicketList(ticketParams);
  const ticketStats = ticketService.getTicketStats(null, resignationId);

  const knowledgeAssets = knowledgeAssetService.getKnowledgeAssets({ resignation_id: resignationId });
  const transferStats = knowledgeAssetService.getKnowledgeTransferStats(null, resignationId);

  const interviewQuestions = completedInterview 
    ? db.filter('interview_question_items', q => q.interview_id === completedInterview.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(q => ({
          id: q.id,
          question_text: q.question_text,
          question_category: q.question_category,
          answer: q.answer,
          is_position_specific: q.is_position_specific,
          is_department_specific: q.is_department_specific
        }))
    : [];

  const report = {
    resignation_id: resignationId,
    resignation: {
      id: resignationId,
      employee_id: resignation.employee_id,
      employee_name: employee ? employee.name : null,
      department_id: resignation.department_id,
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
    interview_questions: interviewQuestions,
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
    data_scope: {
      description: '仅包含当前离职申请相关数据',
      resignation_id: resignationId,
      employee_id: resignation.employee_id
    },
    generated_at: formatDate(new Date())
  };

  const reportId = saveReportRecord({
    report_type: 'exit',
    title: `${employee ? employee.name : ''} - 离职报告`,
    description: `离职日期：${resignation.last_working_date}`,
    period: null,
    department_id: resignation.department_id,
    resignation_id: resignationId,
    employee_id: resignation.employee_id,
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
    detail: `生成离职报告：${employee ? employee.name : ''}（仅包含当前离职申请数据）`
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
    resignation_id: data.resignation_id || null,
    employee_id: data.employee_id || null,
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
  if (!report) return null;

  const enriched = enrichReport(report);

  if (report.report_type === 'exit' && report.resignation_id) {
    const fullReport = generateExitReport(report.resignation_id, report.generated_by || 'system', '系统查询');
    return {
      ...enriched,
      ...fullReport,
      report_id: id,
      created_at: report.created_at,
      updated_at: report.updated_at
    };
  }

  return enriched;
}

module.exports = {
  generateExitReport,
  saveReportRecord,
  getReportList,
  getReportById
};
