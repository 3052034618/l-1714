const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/employees', (req, res) => {
  try {
    db.initDatabase();
    const { department_id, status, page = 1, pageSize = 20 } = req.query;

    let list = db.findAll('employees');

    if (department_id) {
      list = list.filter(e => e.department_id === department_id);
    }

    if (status) {
      list = list.filter(e => e.status === status);
    }

    list = list.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const total = list.length;
    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    const pagedList = list.slice(offset, offset + pageSizeNum).map(emp => {
      const dept = emp.department_id ? db.findById('departments', emp.department_id) : null;
      return {
        ...emp,
        department_name: dept ? dept.name : null
      };
    });

    res.json({ success: true, data: { list: pagedList, total, page: pageNum, pageSize: pageSizeNum } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/employees/:id', (req, res) => {
  try {
    db.initDatabase();
    const employee = db.findById('employees', req.params.id);

    if (!employee) {
      return res.status(404).json({ success: false, message: '员工不存在' });
    }

    const dept = employee.department_id ? db.findById('departments', employee.department_id) : null;

    res.json({ success: true, data: { ...employee, department_name: dept ? dept.name : null } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/departments', (req, res) => {
  try {
    db.initDatabase();
    const departments = db.findAll('departments').sort((a, b) => a.name.localeCompare(b.name));

    const result = departments.map(dept => {
      const manager = dept.manager_id ? db.findById('employees', dept.manager_id) : null;
      return {
        ...dept,
        manager_name: manager ? manager.name : null
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/question-library', (req, res) => {
  try {
    db.initDatabase();
    const { category, position, department_id } = req.query;

    let questions = db.filter('interview_question_library', q => q.is_active === 1);

    if (category) {
      questions = questions.filter(q => q.category === category);
    }

    if (position) {
      questions = questions.filter(q => q.position === null || q.position === position);
    }

    if (department_id) {
      questions = questions.filter(q => q.department_id === null || q.department_id === department_id);
    }

    questions = questions.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.sort_order - b.sort_order;
    });

    res.json({ success: true, data: questions });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/reason-categories', (req, res) => {
  try {
    db.initDatabase();
    const categories = db.filter('resignation_reason_categories', c => c.is_active === 1)
      .sort((a, b) => a.sort_order - b.sort_order);

    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
