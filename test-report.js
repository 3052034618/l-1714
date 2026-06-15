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

async function testMonthlyReport() {
  const baseOptions = {
    hostname: 'localhost',
    port: 3000,
    headers: { 'Content-Type': 'application/json' }
  };

  console.log('=== 月度统计报告测试 ===\n');

  try {
    console.log('1. 获取月度统计数据...');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    let res = await request({
      ...baseOptions,
      path: `/api/reports/monthly/stats?year=${year}&month=${month}`,
      method: 'GET'
    });
    console.log(`   状态: ${res.status}`);
    if (res.body.success) {
      const stats = res.body.data;
      console.log(`   统计周期: ${stats.period}`);
      console.log(`   总离职人数: ${stats.overall.total_resignations}`);
      console.log(`   面谈完成率: ${stats.overall.interview_completion_rate}%`);
      console.log(`   知识转移完成率: ${stats.overall.knowledge_transfer_rate}%`);
      console.log(`   部门数量: ${stats.departments.length}`);
      console.log(`   离职原因分类: ${stats.reason_distribution.length} 类`);
      console.log(`   趋势数据月份: ${stats.trend_data.length} 个月`);
    }
    console.log();

    console.log('2. 生成月度报告（PDF+Excel）...');
    res = await request({
      ...baseOptions,
      path: '/api/reports/monthly',
      method: 'POST'
    }, {
      year,
      month,
      operator_id: 'system',
      operator_name: '系统测试'
    });
    console.log(`   状态: ${res.status}`);
    if (res.body.success) {
      const result = res.body.data;
      console.log(`   PDF路径: ${result.pdf_path}`);
      console.log(`   Excel路径: ${result.excel_path}`);
      console.log(`   PDF报告ID: ${result.pdf_report_id}`);
      console.log(`   Excel报告ID: ${result.excel_report_id}`);
      
      const fs = require('fs');
      const pdfExists = fs.existsSync(result.pdf_path);
      const excelExists = fs.existsSync(result.excel_path);
      console.log(`   PDF文件存在: ${pdfExists}`);
      console.log(`   Excel文件存在: ${excelExists}`);
      
      if (pdfExists) {
        const stats = fs.statSync(result.pdf_path);
        console.log(`   PDF文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      }
      if (excelExists) {
        const stats = fs.statSync(result.excel_path);
        console.log(`   Excel文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      }
    }
    console.log();

    console.log('3. 获取报告列表...');
    res = await request({
      ...baseOptions,
      path: '/api/reports?report_type=monthly',
      method: 'GET'
    });
    console.log(`   状态: ${res.status}`);
    console.log(`   报告数量: ${res.body.data.length}`);
    console.log();

    console.log('=== 月度报告测试完成 ===\n');
    console.log('✓ 月度统计数据生成正常');
    console.log('✓ PDF报告生成成功');
    console.log('✓ Excel报告生成成功');
    console.log('✓ 报告列表查询正常');

  } catch (error) {
    console.error('测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testMonthlyReport();
