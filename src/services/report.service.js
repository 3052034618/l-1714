const db = require('../db');
const { formatDate } = require('../utils/date');
const { logOperation, OperationType, ModuleType } = require('../utils/operation-log');
const ticketService = require('./ticket.service');
const knowledgeAssetService = require('./knowledge-asset.service');

function generateExitReport(resignationId, operatorId, operatorName) {
  db.initDatabase();

  const existingReport = db.findOne('reports', r => 
    r.report_type === 'exit' && r.resignation_id === resignationId
  );

  if (existingReport && existingReport.content) {
    return {
      report_id: existingReport.id,
      ...existingReport.content,
      created_at: existingReport.created_at,
      updated_at: existingReport.updated_at
    };
  }

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

  const ticketList = db.filter('improvement_tickets', t => t.resignation_id === resignationId);
  
  const ticketStats = {
    total: ticketList.length,
    open: ticketList.filter(t => t.status === 'open').length,
    in_progress: ticketList.filter(t => t.status === 'in_progress').length,
    completed: ticketList.filter(t => t.status === 'completed').length,
    closed: ticketList.filter(t => t.status === 'closed').length
  };

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

  const reportContent = {
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
      total: ticketList.length,
      list: ticketList,
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

  let reportId;
  if (existingReport) {
    db.update('reports', existingReport.id, {
      content: reportContent,
      title: `${employee ? employee.name : ''} - 离职报告`,
      description: `离职日期：${resignation.last_working_date}`,
      department_id: resignation.department_id,
      employee_id: resignation.employee_id,
      generated_by: operatorId
    });
    reportId = existingReport.id;
  } else {
    reportId = saveReportRecord({
      report_type: 'exit',
      title: `${employee ? employee.name : ''} - 离职报告`,
      description: `离职日期：${resignation.last_working_date}`,
      period: null,
      department_id: resignation.department_id,
      resignation_id: resignationId,
      employee_id: resignation.employee_id,
      file_path: null,
      file_format: 'json',
      generated_by: operatorId,
      content: reportContent
    });
  }

  logOperation({
    operationType: OperationType.GENERATE,
    module: ModuleType.REPORT,
    relatedId: reportId,
    operatorId,
    operatorName,
    departmentId: resignation.department_id,
    detail: `生成离职报告：${employee ? employee.name : ''}（仅包含当前离职申请数据，已快照保存）`
  });

  return {
    report_id: reportId,
    ...reportContent,
    created_at: formatDate(new Date()),
    updated_at: formatDate(new Date())
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
    generated_by: data.generated_by || null,
    content: data.content || null
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

  if (report.report_type === 'exit' && report.content) {
    return {
      ...enriched,
      ...report.content,
      report_id: id,
      id: id,
      created_at: report.created_at,
      updated_at: report.updated_at
    };
  }

  if (report.report_type === 'exit' && report.resignation_id) {
    const fullReport = generateExitReport(report.resignation_id, report.generated_by || 'system', '系统查询');
    return {
      ...enriched,
      ...fullReport,
      report_id: id,
      id: id,
      created_at: report.created_at,
      updated_at: report.updated_at
    };
  }

  return enriched;
}

function exportReport(id, format = 'json') {
  const report = getReportById(id);
  if (!report) {
    throw new Error('报告不存在');
  }

  if (format === 'json') {
    return {
      format: 'json',
      content: report,
      filename: `report_${id}.json`
    };
  }

  if (format === 'text') {
    const text = generateReportSummary(report);
    return {
      format: 'text',
      content: text,
      filename: `report_${id}_summary.txt`
    };
  }

  throw new Error('不支持的导出格式');
}

function generateReportSummary(report) {
  const lines = [];

  lines.push('========== 离职报告摘要 ==========');
  lines.push('');
  lines.push(`报告ID: ${report.report_id || report.id}`);
  lines.push(`生成时间: ${report.generated_at || report.created_at}`);
  lines.push('');

  if (report.resignation) {
    lines.push('【基本信息】');
    lines.push(`员工姓名: ${report.resignation.employee_name || '-'}`);
    lines.push(`部门: ${report.resignation.department || '-'}`);
    lines.push(`岗位: ${report.resignation.position || '-'}`);
    lines.push(`离职日期: ${report.resignation.last_working_date || '-'}`);
    lines.push(`离职原因: ${report.resignation.reason_category || report.resignation.reason || '-'}`);
    lines.push('');
  }

  if (report.interview) {
    lines.push('【面谈信息】');
    lines.push(`面谈状态: 已完成`);
    lines.push(`面谈来源: ${report.interview.recording_analysis_source || '现场面谈'}`);
    if (report.interview.recording_url) {
      lines.push(`录音地址: ${report.interview.recording_url}`);
    }
    if (report.interview.summary) {
      lines.push(`面谈摘要: ${report.interview.summary}`);
    }
    let keyPoints = report.interview.key_points;
    if (typeof keyPoints === 'string') {
      try {
        keyPoints = JSON.parse(keyPoints);
      } catch (e) {
        keyPoints = [];
      }
    }
    if (keyPoints && keyPoints.length > 0) {
      lines.push('关键反馈:');
      keyPoints.forEach((point, i) => {
        lines.push(`  ${i + 1}. ${point}`);
      });
    }
    lines.push('');
  } else {
    lines.push('【面谈信息】');
    lines.push('面谈状态: 未完成');
    lines.push('');
  }

  if (report.knowledge_transfer) {
    lines.push('【知识转移】');
    lines.push(`知识资产总数: ${report.knowledge_transfer.total_assets || 0}`);
    lines.push(`完成率: ${(report.knowledge_transfer.completion_rate * 100).toFixed(1)}%`);
    if (report.knowledge_transfer.stats) {
      const s = report.knowledge_transfer.stats;
      lines.push(`已完成: ${s.completed || 0}`);
      lines.push(`进行中: ${s.in_progress || 0}`);
      lines.push(`待处理: ${s.pending || 0}`);
      lines.push(`超期: ${s.overdue || 0}`);
    }
    lines.push('');
  }

  if (report.tickets) {
    lines.push('【改进工单】');
    lines.push(`工单总数: ${report.tickets.total || 0}`);
    if (report.tickets.stats) {
      const s = report.tickets.stats;
      lines.push(`待处理: ${s.open || 0}`);
      lines.push(`处理中: ${s.in_progress || 0}`);
      lines.push(`已完成: ${s.completed || 0}`);
      lines.push(`已关闭: ${s.closed || 0}`);
    }
    if (report.tickets.list && report.tickets.list.length > 0) {
      lines.push('');
      lines.push('待处理工单:');
      const pendingTickets = report.tickets.list.filter(t => 
        t.status === 'open' || t.status === 'in_progress'
      );
      if (pendingTickets.length > 0) {
        pendingTickets.forEach((ticket, i) => {
          lines.push(`  ${i + 1}. [${ticket.status}] ${ticket.title}`);
        });
      } else {
        lines.push('  暂无待处理工单');
      }
    }
    lines.push('');
  }

  lines.push('==================================');

  return lines.join('\n');
}

module.exports = {
  generateExitReport,
  saveReportRecord,
  getReportList,
  getReportById,
  exportReport,
  generateReportSummary
};
