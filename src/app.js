const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initDatabase } = require('./db');
const { startSchedulers } = require('./services/scheduler.service');

const resignationRoutes = require('./routes/resignation.routes');
const interviewRoutes = require('./routes/interview.routes');
const ticketRoutes = require('./routes/ticket.routes');
const knowledgeRoutes = require('./routes/knowledge.routes');
const reportRoutes = require('./routes/report.routes');
const operationLogRoutes = require('./routes/operation-log.routes');
const masterDataRoutes = require('./routes/master-data.routes');
const schedulerRoutes = require('./routes/scheduler.routes');
const hrDashboardRoutes = require('./routes/hr-dashboard.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initDatabase();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '员工离职管理系统运行正常' });
});

app.get('/', (req, res) => {
  res.json({
    name: '员工离职管理系统',
    version: '1.0.0',
    description: '自动化面谈安排、知识转移、报告生成',
    endpoints: {
      '/api/resignations': '离职申请管理',
      '/api/interviews': '面谈管理',
      '/api/tickets': '改进工单',
      '/api/knowledge': '知识资产与转移',
      '/api/reports': '报告管理',
      '/api/logs': '操作日志',
      '/api/master': '基础数据'
    }
  });
});

app.use('/api/resignations', resignationRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/logs', operationLogRoutes);
app.use('/api/master', masterDataRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/hr', hrDashboardRoutes);

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: err.message
  });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`员工离职管理系统已启动`);
    console.log(`服务地址: http://localhost:${config.port}`);
    console.log(`健康检查: http://localhost:${config.port}/health`);
    
    startSchedulers();
  });
}

module.exports = app;
