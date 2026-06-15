const express = require('express');
const router = express.Router();
const ticketService = require('../services/ticket.service');

router.get('/', (req, res) => {
  try {
    const result = ticketService.getTicketList(req.query);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const stats = ticketService.getTicketStats(req.query.department_id);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const ticket = ticketService.getTicketById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: '工单不存在' });
    }
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const ticketId = ticketService.createTicket(req.body);
    const ticket = ticketService.getTicketById(ticketId);
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id/status', (req, res) => {
  try {
    const { status, operator_id, operator_name } = req.body;
    const ticket = ticketService.updateTicketStatus(
      req.params.id, status, operator_id, operator_name
    );
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id/assign', (req, res) => {
  try {
    const { assignee_id, assignee_name, operator_id, operator_name } = req.body;
    const ticket = ticketService.assignTicket(
      req.params.id, assignee_id, assignee_name, operator_id, operator_name
    );
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
