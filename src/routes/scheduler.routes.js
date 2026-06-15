const express = require('express');
const router = express.Router();
const schedulerService = require('../services/scheduler.service');

router.post('/run-daily', (req, res) => {
  try {
    const result = schedulerService.runDailyReminders();
    res.json({
      success: true,
      data: {
        message: '每日催办任务执行完成',
        timestamp: result.timestamp,
        summary: {
          interview: result.interview.summary,
          knowledge_transfer: result.knowledgeTransfer.summary
        },
        interview_details: result.interview.details,
        knowledge_transfer_details: result.knowledgeTransfer.details
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/run-interview-reminders', (req, res) => {
  try {
    const result = schedulerService.processInterviewReminders();
    res.json({
      success: true,
      data: {
        message: '面谈催办任务执行完成',
        summary: result.summary,
        details: result.details
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/run-kt-reminders', (req, res) => {
  try {
    const result = schedulerService.processKnowledgeTransferReminders();
    res.json({
      success: true,
      data: {
        message: '知识转移催办任务执行完成',
        summary: result.summary,
        details: result.details
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
