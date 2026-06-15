const express = require('express');
const router = express.Router();
const operationLogService = require('../services/operation-log.service');

router.get('/', (req, res) => {
  try {
    const result = operationLogService.getOperationLogs(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/export', (req, res) => {
  try {
    const logs = operationLogService.exportOperationLogs(req.query);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = operationLogService.getLogStats(req.query);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
