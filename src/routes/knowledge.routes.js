const express = require('express');
const router = express.Router();
const knowledgeAssetService = require('../services/knowledge-asset.service');

router.get('/assets', (req, res) => {
  try {
    const result = knowledgeAssetService.getKnowledgeAssets(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/tasks', (req, res) => {
  try {
    const result = knowledgeAssetService.getTransferTasks(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = knowledgeAssetService.getKnowledgeTransferStats(req.query.department_id);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/scan/:resignationId', (req, res) => {
  try {
    const result = knowledgeAssetService.scanEmployeeAssets(req.params.resignationId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/tasks/:taskId/complete', (req, res) => {
  try {
    const { notes, operator_id, operator_name } = req.body;
    const task = knowledgeAssetService.completeTransferTask(
      req.params.taskId, notes, operator_id, operator_name
    );
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/tasks/:taskId/remind', (req, res) => {
  try {
    const task = knowledgeAssetService.remindTransferTask(req.params.taskId);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/tasks/:taskId/reassign', (req, res) => {
  try {
    const { assignee_id, assignee_name, operator_id, operator_name } = req.body;
    const task = knowledgeAssetService.reassignTransferTask(
      req.params.taskId, assignee_id, assignee_name, operator_id, operator_name
    );
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
