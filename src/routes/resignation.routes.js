const express = require('express');
const router = express.Router();
const resignationService = require('../services/resignation.service');

router.post('/', (req, res) => {
  try {
    const application = resignationService.createResignationApplication(req.body);
    res.json({ success: true, data: application });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/', (req, res) => {
  try {
    const result = resignationService.getResignationList(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const application = resignationService.getResignationById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: '申请不存在' });
    }
    res.json({ success: true, data: application });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/approve', (req, res) => {
  try {
    const { approver_id, approver_name } = req.body;
    const application = resignationService.approveResignation(
      req.params.id, approver_id, approver_name
    );
    res.json({ success: true, data: application });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/reject', (req, res) => {
  try {
    const { reject_reason, operator_id, operator_name } = req.body;
    const application = resignationService.rejectResignation(
      req.params.id, reject_reason, operator_id, operator_name
    );
    res.json({ success: true, data: application });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/:id/complete', (req, res) => {
  try {
    const { operator_id, operator_name } = req.body;
    const application = resignationService.completeResignation(
      req.params.id, operator_id, operator_name
    );
    res.json({ success: true, data: application });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
