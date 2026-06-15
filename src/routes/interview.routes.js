const express = require('express');
const router = express.Router();
const interviewService = require('../services/interview.service');

router.get('/', (req, res) => {
  try {
    const result = interviewService.getInterviewList(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const interview = interviewService.getInterviewById(req.params.id);
    if (!interview) {
      return res.status(404).json({ success: false, message: '面谈记录不存在' });
    }
    res.json({ success: true, data: interview });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/reject', (req, res) => {
  try {
    const { reject_reason, operator_id, operator_name } = req.body;
    const interview = interviewService.rejectInterview(
      req.params.id, reject_reason, operator_id, operator_name
    );
    res.json({ success: true, data: interview });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/reschedule', (req, res) => {
  try {
    const { scheduled_at, operator_id, operator_name } = req.body;
    const interview = interviewService.rescheduleInterview(
      req.params.id, scheduled_at, operator_id, operator_name
    );
    res.json({ success: true, data: interview });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/complete', (req, res) => {
  try {
    const interview = interviewService.recordInterviewResult(
      req.params.id, req.body
    );
    res.json({ success: true, data: interview });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/remind', (req, res) => {
  try {
    const interview = interviewService.remindInterview(req.params.id);
    res.json({ success: true, data: interview });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/escalate', (req, res) => {
  try {
    const interview = interviewService.escalateInterview(req.params.id);
    res.json({ success: true, data: interview });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
