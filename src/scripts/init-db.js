const { initDatabase } = require('../db');

function createTables() {
  initDatabase();
  console.log('数据库初始化完成');
  return true;
}

if (require.main === module) {
  createTables();
  console.log('数据库初始化完成');
}

module.exports = { createTables };
