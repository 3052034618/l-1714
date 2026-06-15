const express = require('express');
const router = express.Router();
const reportService = require('../services/report.service');
const monthlyReportService = require('../services/monthly-report.service');

router.get('/', (req, res) => {
  try {
    const result = reportService.getReportList(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/monthly/stats', (req, res) => {
  try {
    const { year, month } = req.query;
    const stats = monthlyReportService.generateMonthlyStats(
      parseInt(year), parseInt(month)
    );
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/monthly', async (req, res) => {
  try {
    const { year, month, operator_id, operator_name } = req.body;
    const result = monthlyReportService.generateMonthlyReport(
      year, month, operator_id, operator_name
    );
    res.json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/exit/:resignationId', async (req, res) => {
  try {
    const { operator_id, operator_name } = req.body;
    const report = reportService.generateExitReport(
      req.params.resignationId, operator_id, operator_name
    );
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const report = reportService.getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: '报告不存在' });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
