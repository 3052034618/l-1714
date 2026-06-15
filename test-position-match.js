function matchPositionKeywords(position, questionPosition) {
  if (!questionPosition) return true;
  if (!position) return false;
  if (position === questionPosition) return true;

  const keywordMap = {
    '工程师': ['高级工程师', '后端工程师', '前端工程师', '全栈工程师', '测试工程师', '运维工程师', '算法工程师', '工程师'],
    '产品经理': ['高级产品经理', '产品经理', '产品专员', '产品助理'],
    '设计师': ['高级设计师', 'UI设计师', 'UX设计师', '视觉设计师', '交互设计师', '设计师'],
    '运营': ['高级运营', '内容运营', '用户运营', '活动运营', '运营专员', '运营'],
    '销售': ['高级销售', '销售经理', '销售专员', '销售代表', '销售']
  };

  for (const [keyword, variations] of Object.entries(keywordMap)) {
    if (questionPosition === keyword || questionPosition.includes(keyword)) {
      return variations.some(v => position.includes(v));
    }
  }

  return false;
}

console.log('测试岗位匹配：');
console.log('高级工程师 vs 工程师:', matchPositionKeywords('高级工程师', '工程师'));
console.log('前端工程师 vs 工程师:', matchPositionKeywords('前端工程师', '工程师'));
console.log('后端工程师 vs 工程师:', matchPositionKeywords('后端工程师', '工程师'));
console.log('产品经理 vs 工程师:', matchPositionKeywords('产品经理', '工程师'));
console.log('工程师 vs 工程师:', matchPositionKeywords('工程师', '工程师'));
console.log('高级工程师 vs null:', matchPositionKeywords('高级工程师', null));
console.log('高级工程师 vs undefined:', matchPositionKeywords('高级工程师', undefined));

const db = require('./src/db');
db.initDatabase();
console.log('\n数据库中的问题库：');
const questions = db.filter('interview_question_library', q => q.is_active === 1);
questions.forEach(q => {
  console.log(`- ${q.category}: ${q.question.substring(0, 30)}... (position: ${JSON.stringify(q.position)})`);
});

console.log('\n测试匹配高级工程师：');
questions.forEach(q => {
  const match = matchPositionKeywords('高级工程师', q.position);
  console.log(`- [${match ? '✓' : '✗'}] ${q.question.substring(0, 30)}... (position: ${JSON.stringify(q.position)})`);
});
