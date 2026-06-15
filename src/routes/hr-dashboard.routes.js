const express = require('express');
const router = express.Router();
const hrDashboardService = require('../services/hr-dashboard.service');

router.get('/summary', (req, res) => {
  try {
    const { department_id, manager_id, hrbp_id } = req.query;
    const filters = {
      manager_id,
      hrbp_id
    };
    const data = hrDashboardService.getHrDashboard(department_id, filters);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
