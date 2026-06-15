const db = require('../db');
const { formatDate, getMonthRange, getCurrentMonthRange } = require('../utils/date');
const { logOperation, OperationType, ModuleType } = require('../utils/operation-log');
const { saveReportRecord } = require('./report.service');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

function generateMonthlyStats(year, month, departmentId = null) {
  db.initDatabase();
  const { start, end } = getMonthRange(year, month);

  const allDepartments = db.findAll('departments');
  const departments = departmentId 
    ? allDepartments.filter(d => d.id === departmentId)
    : allDepartments;

  const deptName = departmentId 
    ? allDepartments.find(d => d.id === departmentId)?.name 
    : null;

  const stats = {
    period: `${year}年${month}月`,
    department_id: departmentId,
    department_name: deptName,
    start_date: start,
    end_date: end,
    generated_at: formatDate(new Date()),
    overall: {
      total_resignations: 0,
      interview_completion_rate: 0,
      knowledge_transfer_rate: 0,
      total_tickets: 0,
      completed_tickets: 0
    },
    departments: [],
    reason_distribution: [],
    trend_data: []
  };

  let allResignations = db.filter('resignation_applications', item => 
    item.created_at >= start && item.created_at <= end
  );

  if (departmentId) {
    allResignations = allResignations.filter(r => r.department_id === departmentId);
  }

  stats.overall.total_resignations = allResignations.length;

  const allInterviews = db.findAll('interviews');
  const allKtTasks = db.findAll('knowledge_transfer_tasks');
  const allTickets = db.findAll('improvement_tickets');

  departments.forEach(dept => {
    const deptResignations = allResignations.filter(r => r.department_id === dept.id);
    const deptIds = deptResignations.map(r => r.id);

    let interviewCompleted = 0;
    let interviewTotal = 0;
    if (deptIds.length > 0) {
      const deptInterviews = allInterviews.filter(i => deptIds.includes(i.resignation_id));
      interviewTotal = deptInterviews.length;
      interviewCompleted = deptInterviews.filter(i => i.status === 'completed').length;
    }

    let ktCompleted = 0;
    let ktTotal = 0;
    if (deptIds.length > 0) {
      const deptKtTasks = allKtTasks.filter(t => deptIds.includes(t.resignation_id));
      ktTotal = deptKtTasks.length;
      ktCompleted = deptKtTasks.filter(t => t.status === 'completed').length;
    }

    let deptTickets = allTickets.filter(t => 
      t.department_id === dept.id && t.created_at >= start && t.created_at <= end
    );
    const deptTicketsCompleted = deptTickets.filter(t => t.status === 'completed').length;

    stats.departments.push({
      department_id: dept.id,
      department_name: dept.name,
      total_resignations: deptResignations.length,
      interview_completed: interviewCompleted,
      interview_total: interviewTotal,
      interview_completion_rate: interviewTotal > 0 ? Math.round((interviewCompleted / interviewTotal) * 100) : 0,
      knowledge_transfer_completed: ktCompleted,
      knowledge_transfer_total: ktTotal,
      knowledge_transfer_rate: ktTotal > 0 ? Math.round((ktCompleted / ktTotal) * 100) : 0,
      total_tickets: deptTickets.length,
      completed_tickets: deptTicketsCompleted
    });
  });

  const reasonMap = allResignations.reduce((acc, ra) => {
    const category = ra.reason_category || '未分类';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  stats.reason_distribution = Object.entries(reasonMap)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const trendStartDate = new Date(year, month - 1, 1);
  trendStartDate.setMonth(trendStartDate.getMonth() - 5);

  const allMonthKeys = generateMonthKeys(trendStartDate, new Date(year, month - 1, 1));

  let trendResignations = db.filter('resignation_applications', item => {
    const itemDate = new Date(item.created_at.replace(/-/g, '/'));
    return itemDate >= trendStartDate && item.created_at <= end;
  });

  if (departmentId) {
    trendResignations = trendResignations.filter(r => r.department_id === departmentId);
  }

  const trendMap = trendResignations.reduce((acc, item) => {
    const monthKey = item.created_at.substring(0, 7);
    acc[monthKey] = (acc[monthKey] || 0) + 1;
    return acc;
  }, {});

  stats.trend_data = allMonthKeys.map(monthKey => ({
    month: monthKey,
    count: trendMap[monthKey] || 0
  }));

  if (stats.departments.length > 0) {
    const totalInterviews = stats.departments.reduce((sum, d) => sum + d.interview_total, 0);
    const completedInterviews = stats.departments.reduce((sum, d) => sum + d.interview_completed, 0);
    stats.overall.interview_completion_rate = totalInterviews > 0 ? Math.round((completedInterviews / totalInterviews) * 100) : 0;

    const totalKT = stats.departments.reduce((sum, d) => sum + d.knowledge_transfer_total, 0);
    const completedKT = stats.departments.reduce((sum, d) => sum + d.knowledge_transfer_completed, 0);
    stats.overall.knowledge_transfer_rate = totalKT > 0 ? Math.round((completedKT / totalKT) * 100) : 0;

    stats.overall.total_tickets = stats.departments.reduce((sum, d) => sum + d.total_tickets, 0);
    stats.overall.completed_tickets = stats.departments.reduce((sum, d) => sum + d.completed_tickets, 0);
  }

  return stats;
}

function generateMonthlyRangeStats(startYear, startMonth, endYear, endMonth, departmentId = null) {
  db.initDatabase();

  const allMonthKeys = generateMonthKeys(
    new Date(startYear, startMonth - 1, 1),
    new Date(endYear, endMonth - 1, 28)
  );

  const monthlyStats = [];
  let combinedTrendData = [];
  let overallSummary = {
    total_resignations: 0,
    total_interviews: 0,
    completed_interviews: 0,
    total_tickets: 0,
    completed_tickets: 0
  };

  const allDepartments = db.findAll('departments');
  const deptName = departmentId 
    ? allDepartments.find(d => d.id === departmentId)?.name 
    : null;

  allMonthKeys.forEach(monthKey => {
    const [year, month] = monthKey.split('-').map(Number);
    const stats = generateMonthlyStats(year, month, departmentId);
    monthlyStats.push({
      month: monthKey,
      year,
      month_num: month,
      stats: stats
    });

    overallSummary.total_resignations += stats.overall.total_resignations;
    overallSummary.total_tickets += stats.overall.total_tickets;
    overallSummary.completed_tickets += stats.overall.completed_tickets;

    stats.departments.forEach(d => {
      overallSummary.total_interviews += d.interview_total;
      overallSummary.completed_interviews += d.interview_completed;
    });
  });

  combinedTrendData = allMonthKeys.map(monthKey => {
    const monthStat = monthlyStats.find(m => m.month === monthKey);
    return {
      month: monthKey,
      count: monthStat ? monthStat.stats.overall.total_resignations : 0,
      interview_completion_rate: monthStat ? monthStat.stats.overall.interview_completion_rate : 0,
      knowledge_transfer_rate: monthStat ? monthStat.stats.overall.knowledge_transfer_rate : 0
    };
  });

  const reasonDistribution = calculateCombinedReasonDistribution(startYear, startMonth, endYear, endMonth, departmentId);

  const departmentComparison = calculateDepartmentComparison(startYear, startMonth, endYear, endMonth, departmentId);

  return {
    period: `${startYear}年${startMonth}月 - ${endYear}年${endMonth}月`,
    department_id: departmentId,
    department_name: deptName,
    start_date: `${startYear}-${startMonth.toString().padStart(2, '0')}-01 00:00:00`,
    end_date: getMonthRange(endYear, endMonth).end,
    generated_at: formatDate(new Date()),
    months_count: allMonthKeys.length,
    overall_summary: {
      ...overallSummary,
      interview_completion_rate: overallSummary.total_interviews > 0 
        ? Math.round((overallSummary.completed_interviews / overallSummary.total_interviews) * 100) 
        : 0
    },
    monthly_stats: monthlyStats,
    trend_data: combinedTrendData,
    reason_distribution: reasonDistribution,
    department_comparison: departmentComparison
  };
}

function generateMonthKeys(startDate, endDate) {
  const months = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const year = current.getFullYear();
    const month = (current.getMonth() + 1).toString().padStart(2, '0');
    months.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

function calculateCombinedReasonDistribution(startYear, startMonth, endYear, endMonth, departmentId) {
  const startDate = getMonthRange(startYear, startMonth).start;
  const endDate = getMonthRange(endYear, endMonth).end;

  let resignations = db.filter('resignation_applications', item => 
    item.created_at >= startDate && item.created_at <= endDate
  );

  if (departmentId) {
    resignations = resignations.filter(r => r.department_id === departmentId);
  }

  const reasonMap = resignations.reduce((acc, ra) => {
    const category = ra.reason_category || '未分类';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(reasonMap)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

function calculateDepartmentComparison(startYear, startMonth, endYear, endMonth, departmentId) {
  const startDate = getMonthRange(startYear, startMonth).start;
  const endDate = getMonthRange(endYear, endMonth).end;

  let resignations = db.filter('resignation_applications', item => 
    item.created_at >= startDate && item.created_at <= endDate
  );

  if (departmentId) {
    resignations = resignations.filter(r => r.department_id === departmentId);
  }

  const allDepartments = db.findAll('departments');
  const departments = departmentId 
    ? allDepartments.filter(d => d.id === departmentId)
    : allDepartments;

  const allInterviews = db.findAll('interviews');
  const allKtTasks = db.findAll('knowledge_transfer_tasks');
  const allTickets = db.findAll('improvement_tickets');

  return departments.map(dept => {
    const deptResignations = resignations.filter(r => r.department_id === dept.id);
    const deptIds = deptResignations.map(r => r.id);

    let interviewCompleted = 0;
    let interviewTotal = 0;
    if (deptIds.length > 0) {
      const deptInterviews = allInterviews.filter(i => deptIds.includes(i.resignation_id));
      interviewTotal = deptInterviews.length;
      interviewCompleted = deptInterviews.filter(i => i.status === 'completed').length;
    }

    let ktCompleted = 0;
    let ktTotal = 0;
    if (deptIds.length > 0) {
      const deptKtTasks = allKtTasks.filter(t => deptIds.includes(t.resignation_id));
      ktTotal = deptKtTasks.length;
      ktCompleted = deptKtTasks.filter(t => t.status === 'completed').length;
    }

    const deptTickets = allTickets.filter(t => 
      t.department_id === dept.id && t.created_at >= startDate && t.created_at <= endDate
    );

    return {
      department_id: dept.id,
      department_name: dept.name,
      total_resignations: deptResignations.length,
      interview_completion_rate: interviewTotal > 0 ? Math.round((interviewCompleted / interviewTotal) * 100) : 0,
      knowledge_transfer_rate: ktTotal > 0 ? Math.round((ktCompleted / ktTotal) * 100) : 0,
      total_tickets: deptTickets.length
    };
  });
}

function generateMonthlyReportPDF(year, month, stats) {
  const reportDir = config.report.dir;
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const fileName = `monthly-report-${year}-${month.toString().padStart(2, '0')}.pdf`;
  const filePath = path.join(reportDir, fileName);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(20).text('月度离职统计报告', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`统计周期：${stats.period}`, { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(14).text('一、整体概览');
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`总离职人数：${stats.overall.total_resignations} 人`);
  doc.text(`面谈完成率：${stats.overall.interview_completion_rate}%`);
  doc.text(`知识转移完成率：${stats.overall.knowledge_transfer_rate}%`);
  doc.text(`改进工单总数：${stats.overall.total_tickets} 个`);
  doc.text(`已完成工单：${stats.overall.completed_tickets} 个`);
  doc.moveDown(2);

  doc.fontSize(14).text('二、各部门对比');
  doc.moveDown();
  doc.fontSize(10);

  const tableTop = doc.y;
  const colWidths = [100, 60, 70, 70, 60];
  const colX = [50, 150, 210, 280, 350];

  doc.text('部门', colX[0], tableTop);
  doc.text('离职人数', colX[1], tableTop);
  doc.text('面谈完成率', colX[2], tableTop);
  doc.text('知识转移率', colX[3], tableTop);
  doc.text('工单数', colX[4], tableTop);

  let y = tableTop + 20;
  stats.departments.forEach(dept => {
    doc.text(dept.department_name, colX[0], y);
    doc.text(dept.total_resignations.toString(), colX[1], y);
    doc.text(dept.interview_completion_rate + '%', colX[2], y);
    doc.text(dept.knowledge_transfer_rate + '%', colX[3], y);
    doc.text(dept.total_tickets.toString(), colX[4], y);
    y += 20;
  });

  doc.moveDown(3);

  doc.fontSize(14).text('三、离职原因分布');
  doc.moveDown();
  doc.fontSize(11);
  stats.reason_distribution.forEach(reason => {
    doc.text(`• ${reason.category}：${reason.count} 人`);
  });
  doc.moveDown(2);

  doc.fontSize(14).text('四、近6个月趋势');
  doc.moveDown();
  doc.fontSize(11);
  stats.trend_data.forEach(t => {
    doc.text(`• ${t.month}：${t.count} 人`);
  });

  doc.moveDown(3);
  doc.fontSize(10).text(`生成时间：${stats.generated_at}`, { align: 'right' });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

function generateMonthlyReportExcel(year, month, stats) {
  const reportDir = config.report.dir;
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const fileName = `monthly-report-${year}-${month.toString().padStart(2, '0')}.xlsx`;
  const filePath = path.join(reportDir, fileName);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '离职管理系统';
  workbook.created = new Date();

  const overviewSheet = workbook.addWorksheet('整体概览');
  overviewSheet.columns = [
    { header: '指标', key: 'metric', width: 30 },
    { header: '数值', key: 'value', width: 20 }
  ];

  overviewSheet.addRow({ metric: '统计周期', value: stats.period });
  overviewSheet.addRow({ metric: '总离职人数', value: stats.overall.total_resignations });
  overviewSheet.addRow({ metric: '面谈完成率', value: stats.overall.interview_completion_rate + '%' });
  overviewSheet.addRow({ metric: '知识转移完成率', value: stats.overall.knowledge_transfer_rate + '%' });
  overviewSheet.addRow({ metric: '改进工单总数', value: stats.overall.total_tickets });
  overviewSheet.addRow({ metric: '已完成工单', value: stats.overall.completed_tickets });

  overviewSheet.getRow(1).font = { bold: true };

  const deptSheet = workbook.addWorksheet('部门对比');
  deptSheet.columns = [
    { header: '部门', key: 'department_name', width: 20 },
    { header: '离职人数', key: 'total_resignations', width: 12 },
    { header: '面谈完成数', key: 'interview_completed', width: 12 },
    { header: '面谈完成率', key: 'interview_completion_rate', width: 12 },
    { header: '知识转移完成数', key: 'knowledge_transfer_completed', width: 15 },
    { header: '知识转移率', key: 'knowledge_transfer_rate', width: 12 },
    { header: '工单数', key: 'total_tickets', width: 10 },
    { header: '已完成工单', key: 'completed_tickets', width: 12 }
  ];

  stats.departments.forEach(dept => {
    deptSheet.addRow({
      ...dept,
      interview_completion_rate: dept.interview_completion_rate + '%',
      knowledge_transfer_rate: dept.knowledge_transfer_rate + '%'
    });
  });

  deptSheet.getRow(1).font = { bold: true };

  const reasonSheet = workbook.addWorksheet('离职原因分布');
  reasonSheet.columns = [
    { header: '原因分类', key: 'category', width: 30 },
    { header: '人数', key: 'count', width: 15 }
  ];

  stats.reason_distribution.forEach(r => reasonSheet.addRow(r));
  reasonSheet.getRow(1).font = { bold: true };

  const trendSheet = workbook.addWorksheet('趋势数据');
  trendSheet.columns = [
    { header: '月份', key: 'month', width: 15 },
    { header: '离职人数', key: 'count', width: 15 }
  ];

  stats.trend_data.forEach(t => trendSheet.addRow(t));
  trendSheet.getRow(1).font = { bold: true };

  return workbook.xlsx.writeFile(filePath).then(() => filePath);
}

async function generateMonthlyReport(year, month, operatorId, operatorName) {
  const stats = generateMonthlyStats(year, month, operatorId, operatorName);

  const pdfPath = await generateMonthlyReportPDF(year, month, stats);
  const excelPath = await generateMonthlyReportExcel(year, month, stats);

  const pdfReportId = saveReportRecord({
    report_type: 'monthly',
    title: `${year}年${month}月离职统计报告`,
    description: '月度离职统计报告（PDF格式）',
    period: `${year}-${month.toString().padStart(2, '0')}`,
    department_id: null,
    file_path: pdfPath,
    file_format: 'pdf',
    generated_by: operatorId
  });

  const excelReportId = saveReportRecord({
    report_type: 'monthly',
    title: `${year}年${month}月离职统计报告`,
    description: '月度离职统计报告（Excel格式）',
    period: `${year}-${month.toString().padStart(2, '0')}`,
    department_id: null,
    file_path: excelPath,
    file_format: 'excel',
    generated_by: operatorId
  });

  logOperation({
    operationType: OperationType.GENERATE,
    module: ModuleType.REPORT,
    relatedId: pdfReportId,
    operatorId,
    operatorName,
    departmentId: null,
    detail: `生成月度统计报告：${year}年${month}月`
  });

  return {
    stats,
    pdf_path: pdfPath,
    excel_path: excelPath,
    pdf_report_id: pdfReportId,
    excel_report_id: excelReportId
  };
}

module.exports = {
  generateMonthlyStats,
  generateMonthlyRangeStats,
  generateMonthKeys,
  generateMonthlyReportPDF,
  generateMonthlyReportExcel,
  generateMonthlyReport
};
