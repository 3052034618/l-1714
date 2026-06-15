const db = require('./src/db');
db.initDatabase();

console.log('=== 检查离职申请数据 ===');
const resignations = db.findAll('resignation_applications');
resignations.forEach(r => {
  console.log(`\n离职申请 ${r.id.substring(0, 8)}:`);
  console.log(`  员工: ${r.employee_id}`);
  console.log(`  岗位: ${JSON.stringify(r.position)}`);
  console.log(`  部门: ${r.department_id}`);
  console.log(`  状态: ${r.status}`);
});

console.log('\n\n=== 检查面谈数据 ===');
const interviews = db.findAll('interviews');
interviews.forEach(i => {
  console.log(`\n面谈 ${i.id.substring(0, 8)}:`);
  console.log(`  员工: ${i.employee_id}`);
  console.log(`  离职申请: ${i.resignation_id}`);
  console.log(`  状态: ${i.status}`);
  
  const questions = db.filter('interview_question_items', q => q.interview_id === i.id);
  console.log(`  问题数量: ${questions.length}`);
  questions.forEach(q => {
    console.log(`    - [${q.sort_order}] ${q.question_category}: ${q.question_text.substring(0, 30)}... (岗位特定: ${q.is_position_specific})`);
  });
});

console.log('\n\n=== 检查员工张三 ===');
const employee = db.findById('employees', 'bda7e2dc-057d-41f2-92a9-e86efbefc702');
console.log('员工信息:', JSON.stringify(employee, null, 2));
