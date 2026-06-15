const { v4: uuidv4 } = require('uuid');
const db = require('../db');

function seedData() {
  db.initDatabase();

  if (db.findAll('departments').length > 0) {
    console.log('数据库已有数据，跳过种子数据插入');
    return { departments: [], employees: [], questions: [], reasonCategories: [] };
  }

  const departments = [
    { id: uuidv4(), name: '技术部', manager_id: null },
    { id: uuidv4(), name: '产品部', manager_id: null },
    { id: uuidv4(), name: '人力资源部', manager_id: null },
    { id: uuidv4(), name: '市场部', manager_id: null },
    { id: uuidv4(), name: '财务部', manager_id: null }
  ];

  departments.forEach(d => db.insert('departments', d));

  const hrDept = departments.find(d => d.name === '人力资源部');
  const techDept = departments.find(d => d.name === '技术部');
  const productDept = departments.find(d => d.name === '产品部');

  const employees = [
    { id: uuidv4(), name: '张三', email: 'zhangsan@example.com', department_id: techDept.id, position: '高级工程师', level: 'P6', role: 'employee', status: 'active', hire_date: '2020-01-15' },
    { id: uuidv4(), name: '李四', email: 'lisi@example.com', department_id: techDept.id, position: '前端工程师', level: 'P5', role: 'employee', status: 'active', hire_date: '2021-03-20' },
    { id: uuidv4(), name: '王五', email: 'wangwu@example.com', department_id: techDept.id, position: '技术总监', level: 'P8', role: 'manager', status: 'active', hire_date: '2018-06-01' },
    { id: uuidv4(), name: '赵六', email: 'zhaoliu@example.com', department_id: productDept.id, position: '产品经理', level: 'P6', role: 'employee', status: 'active', hire_date: '2019-09-10' },
    { id: uuidv4(), name: '钱七', email: 'qianqi@example.com', department_id: productDept.id, position: '产品总监', level: 'P8', role: 'manager', status: 'active', hire_date: '2017-02-14' },
    { id: uuidv4(), name: '孙八', email: 'sunba@example.com', department_id: hrDept.id, position: 'HRBP', level: 'P5', role: 'hr', status: 'active', hire_date: '2020-07-01' },
    { id: uuidv4(), name: '周九', email: 'zhoujiu@example.com', department_id: hrDept.id, position: 'HR总监', level: 'P8', role: 'hr_director', status: 'active', hire_date: '2016-11-20' },
    { id: uuidv4(), name: '吴十', email: 'wushi@example.com', department_id: techDept.id, position: '后端工程师', level: 'P5', role: 'employee', status: 'active', hire_date: '2022-01-10' }
  ];

  employees.forEach(e => db.insert('employees', e));

  const techManager = employees.find(e => e.name === '王五');
  const productManager = employees.find(e => e.name === '钱七');
  
  db.update('departments', techDept.id, { manager_id: techManager.id });
  db.update('departments', productDept.id, { manager_id: productManager.id });

  const questions = [
    { category: '职业发展', position: null, question: '你认为公司在职业发展方面有哪些可以改进的地方？', sort_order: 1, is_active: 1 },
    { category: '职业发展', position: '工程师', question: '技术成长路径是否清晰？有哪些改进建议？', sort_order: 2, is_active: 1 },
    { category: '职业发展', position: '产品经理', question: '产品职业发展通道是否满足你的期望？', sort_order: 2, is_active: 1 },
    { category: '薪酬福利', position: null, question: '你对当前的薪酬福利满意吗？有哪些改进建议？', sort_order: 1, is_active: 1 },
    { category: '工作环境', position: null, question: '办公环境和工作氛围如何？', sort_order: 1, is_active: 1 },
    { category: '团队协作', position: null, question: '团队沟通和协作效率如何？', sort_order: 1, is_active: 1 },
    { category: '团队协作', position: '工程师', question: '研发流程和协作工具有哪些需要优化的？', sort_order: 2, is_active: 1 },
    { category: '管理问题', position: null, question: '你对直属上级的管理方式有什么建议？', sort_order: 1, is_active: 1 },
    { category: '管理问题', position: null, question: '公司层面的管理有哪些需要改进的地方？', sort_order: 2, is_active: 1 },
    { category: '其他', position: null, question: '你还有其他想反馈的问题吗？', sort_order: 1, is_active: 1 }
  ];

  questions.forEach(q => {
    db.insert('interview_question_library', { ...q, question_type: 'open' });
  });

  const reasonCategories = [
    { name: '职业发展受限', sort_order: 1, is_active: 1 },
    { name: '薪酬待遇不满', sort_order: 2, is_active: 1 },
    { name: '工作压力大', sort_order: 3, is_active: 1 },
    { name: '家庭原因', sort_order: 4, is_active: 1 },
    { name: '个人发展规划', sort_order: 5, is_active: 1 },
    { name: '团队/管理问题', sort_order: 6, is_active: 1 },
    { name: '其他', sort_order: 7, is_active: 1 }
  ];

  reasonCategories.forEach(r => {
    db.insert('resignation_reason_categories', r);
  });

  console.log('种子数据插入完成');
  console.log(`- 部门: ${departments.length} 个`);
  console.log(`- 员工: ${employees.length} 人`);
  console.log(`- 面谈问题: ${questions.length} 个`);
  console.log(`- 离职原因分类: ${reasonCategories.length} 个`);

  return { departments, employees, questions, reasonCategories };
}

if (require.main === module) {
  seedData();
  console.log('数据初始化完成');
}

module.exports = { seedData };
