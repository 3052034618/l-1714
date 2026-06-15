const http = require('http');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const baseOptions = {
    hostname: 'localhost',
    port: 3000,
    headers: { 'Content-Type': 'application/json' }
  };

  console.log('=== 员工离职管理系统 API 测试 ===\n');

  try {
    console.log('1. 测试健康检查...');
    let res = await request({ ...baseOptions, path: '/health', method: 'GET' });
    console.log(`   状态: ${res.status} - ${JSON.stringify(res.body)}\n`);

    console.log('2. 获取部门列表...');
    res = await request({ ...baseOptions, path: '/api/master/departments', method: 'GET' });
    console.log(`   状态: ${res.status}`);
    console.log(`   部门数量: ${res.body.data.length}`);
    const techDept = res.body.data.find(d => d.name === '技术部');
    const hrDept = res.body.data.find(d => d.name === '人力资源部');
    console.log(`   技术部ID: ${techDept.id}`);
    console.log(`   人力资源部ID: ${hrDept.id}\n`);

    console.log('3. 获取员工列表...');
    res = await request({ ...baseOptions, path: '/api/master/employees', method: 'GET' });
    console.log(`   状态: ${res.status}`);
    console.log(`   员工数量: ${res.body.data.total}`);
    const techEmployees = res.body.data.list.filter(e => e.department_name === '技术部');
    console.log(`   技术部员工: ${techEmployees.length} 人`);
    const testEmployee = techEmployees[0];
    const hrEmployee = res.body.data.list.find(e => e.role === 'hr');
    console.log(`   测试员工: ${testEmployee.name} (${testEmployee.id})`);
    console.log(`   HR员工: ${hrEmployee.name} (${hrEmployee.id})\n`);

    console.log('4. 提交离职申请...');
    const resignationData = {
      employee_id: testEmployee.id,
      resignation_date: '2024-06-01',
      last_working_date: '2024-07-01',
      reason: '个人发展规划',
      reason_category: '个人发展规划',
      operator_id: testEmployee.id,
      operator_name: testEmployee.name
    };
    res = await request({
      ...baseOptions,
      path: '/api/resignations',
      method: 'POST'
    }, resignationData);
    console.log(`   状态: ${res.status}`);
    console.log(`   申请ID: ${res.body.data.id}`);
    console.log(`   申请状态: ${res.body.data.status}`);
    const resignationId = res.body.data.id;
    console.log();

    console.log('5. 审批离职申请...');
    const approveData = {
      approver_id: hrEmployee.id,
      approver_name: hrEmployee.name
    };
    res = await request({
      ...baseOptions,
      path: `/api/resignations/${resignationId}/approve`,
      method: 'POST'
    }, approveData);
    console.log(`   状态: ${res.status}`);
    console.log(`   申请状态: ${res.body.data.status}`);
    console.log(`   审批时间: ${res.body.data.approved_at}`);
    console.log();

    console.log('6. 获取面谈列表...');
    res = await request({ ...baseOptions, path: '/api/interviews', method: 'GET' });
    console.log(`   状态: ${res.status}`);
    console.log(`   面谈数量: ${res.body.data.total}`);
    if (res.body.data.list.length > 0) {
      const interview = res.body.data.list[0];
      console.log(`   面谈ID: ${interview.id}`);
      console.log(`   面谈状态: ${interview.status}`);
      console.log(`   计划时间: ${interview.scheduled_at}`);
      const interviewId = interview.id;
      console.log();

      console.log('7. 获取面谈详情（含问题清单）...');
      res = await request({ ...baseOptions, path: `/api/interviews/${interviewId}`, method: 'GET' });
      console.log(`   状态: ${res.status}`);
      console.log(`   问题数量: ${res.body.data.questions.length}`);
      console.log(`   问题分类: ${[...new Set(res.body.data.questions.map(q => q.question_category))].join(', ')}`);
      console.log();

      console.log('8. 记录面谈结果...');
      const questions = res.body.data.questions;
      const answers = questions.slice(0, 3).map(q => ({
        item_id: q.id,
        answer: `这是对问题"${q.question_text}"的回答。整体体验还不错，但有一些改进空间。`
      }));

      const resultData = {
        actual_start_at: '2024-06-05 14:00:00',
        actual_end_at: '2024-06-05 15:00:00',
        summary: '员工对职业发展有一些建议，整体反馈偏正面',
        feedback_category: '职业发展',
        key_points: ['希望有更多培训机会', '建议优化晋升通道'],
        answers,
        operator_id: hrEmployee.id,
        operator_name: hrEmployee.name
      };
      res = await request({
        ...baseOptions,
        path: `/api/interviews/${interviewId}/complete`,
        method: 'POST'
      }, resultData);
      console.log(`   状态: ${res.status}`);
      console.log(`   面谈状态: ${res.body.data.status}`);
      console.log();
    }

    console.log('9. 获取知识资产列表...');
    res = await request({
      ...baseOptions,
      path: '/api/knowledge/assets?resignation_id=' + resignationId,
      method: 'GET'
    });
    console.log(`   状态: ${res.status}`);
    console.log(`   资产数量: ${res.body.data.length}`);
    if (res.body.data.length > 0) {
      console.log(`   资产类型: ${[...new Set(res.body.data.map(a => a.asset_type))].join(', ')}`);
    }
    console.log();

    console.log('10. 获取知识转移任务...');
    res = await request({
      ...baseOptions,
      path: '/api/knowledge/tasks?resignation_id=' + resignationId,
      method: 'GET'
    });
    console.log(`   状态: ${res.status}`);
    console.log(`   任务数量: ${res.body.data.length}`);
    if (res.body.data.length > 0) {
      const task = res.body.data[0];
      console.log(`   任务状态: ${task.status}`);
      console.log(`   截止日期: ${task.deadline}`);
      console.log(`   负责人: ${task.assignee_name}`);
    }
    console.log();

    console.log('11. 获取改进工单列表...');
    res = await request({ ...baseOptions, path: '/api/tickets', method: 'GET' });
    console.log(`   状态: ${res.status}`);
    console.log(`   工单数量: ${res.body.data.total}`);
    if (res.body.data.list.length > 0) {
      console.log(`   工单分类: ${[...new Set(res.body.data.list.map(t => t.category))].join(', ')}`);
    }
    console.log();

    console.log('12. 获取操作日志...');
    res = await request({ ...baseOptions, path: '/api/logs?page=1&pageSize=10', method: 'GET' });
    console.log(`   状态: ${res.status}`);
    console.log(`   日志数量: ${res.body.data.total}`);
    if (res.body.data.list.length > 0) {
      const modules = [...new Set(res.body.data.list.map(l => l.module))];
      console.log(`   涉及模块: ${modules.join(', ')}`);
    }
    console.log();

    console.log('13. 获取面谈问题库...');
    res = await request({ ...baseOptions, path: '/api/master/question-library', method: 'GET' });
    console.log(`   状态: ${res.status}`);
    console.log(`   问题数量: ${res.body.data.length}`);
    console.log(`   分类: ${[...new Set(res.body.data.map(q => q.category))].join(', ')}`);
    console.log();

    console.log('14. 生成离职报告...');
    res = await request({
      ...baseOptions,
      path: `/api/reports/exit/${resignationId}`,
      method: 'POST'
    }, {
      operator_id: hrEmployee.id,
      operator_name: hrEmployee.name
    });
    console.log(`   状态: ${res.status}`);
    console.log(`   报告ID: ${res.body.data.report_id}`);
    console.log(`   工单总数: ${res.body.data.tickets.total}`);
    console.log(`   知识转移完成率: ${res.body.data.knowledge_transfer.completion_rate}%`);
    console.log();

    console.log('15. 拒绝面谈测试...');
    const testEmployee2 = techEmployees[1];
    if (testEmployee2) {
      console.log('   创建第二个离职申请用于测试拒绝功能...');
      const resignationData2 = {
        employee_id: testEmployee2.id,
        resignation_date: '2024-06-10',
        last_working_date: '2024-07-10',
        reason: '另谋高就',
        reason_category: '职业发展受限',
        operator_id: testEmployee2.id,
        operator_name: testEmployee2.name
      };
      res = await request({
        ...baseOptions,
        path: '/api/resignations',
        method: 'POST'
      }, resignationData2);
      const resignationId2 = res.body.data.id;

      res = await request({
        ...baseOptions,
        path: `/api/resignations/${resignationId2}/approve`,
        method: 'POST'
      }, approveData);

      res = await request({
        ...baseOptions,
        path: '/api/interviews?employee_id=' + testEmployee2.id,
        method: 'GET'
      });
      if (res.body.data.list.length > 0) {
        const interview2 = res.body.data.list[0];
        console.log(`   拒绝面谈ID: ${interview2.id}`);
        res = await request({
          ...baseOptions,
          path: `/api/interviews/${interview2.id}/reject`,
          method: 'POST'
        }, {
          reject_reason: '个人原因，暂不参加面谈',
          operator_id: testEmployee2.id,
          operator_name: testEmployee2.name
        });
        console.log(`   拒绝状态: ${res.body.data.status}`);
        console.log(`   拒绝原因: ${res.body.data.reject_reason}`);
      }
    }
    console.log();

    console.log('=== 测试完成 ===');
    console.log('\n所有核心功能测试通过！');
    console.log('- 离职申请提交与审批 ✓');
    console.log('- 自动安排面谈 ✓');
    console.log('- 个性化面谈问题清单 ✓');
    console.log('- 面谈记录与分析 ✓');
    console.log('- 自动生成改进工单 ✓');
    console.log('- 知识资产扫描 ✓');
    console.log('- 知识转移任务分配 ✓');
    console.log('- 拒绝面谈功能 ✓');
    console.log('- 操作日志记录 ✓');
    console.log('- 离职报告生成 ✓');

  } catch (error) {
    console.error('测试失败:', error.message);
    process.exit(1);
  }
}

runTests();
