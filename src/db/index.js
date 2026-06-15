const fs = require('fs');
const path = require('path');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

let dbData = null;
let dbFilePath = null;

function initDatabase() {
  const dataDir = path.dirname(config.db.path);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  dbFilePath = config.db.path;

  if (fs.existsSync(dbFilePath)) {
    const content = fs.readFileSync(dbFilePath, 'utf-8');
    dbData = JSON.parse(content);
  } else {
    dbData = {
      departments: [],
      employees: [],
      resignation_applications: [],
      interview_question_library: [],
      interviews: [],
      interview_question_items: [],
      improvement_tickets: [],
      knowledge_assets: [],
      knowledge_transfer_tasks: [],
      reminders: [],
      reports: [],
      operation_logs: [],
      resignation_reason_categories: []
    };
    saveData();
  }

  return dbData;
}

function saveData() {
  if (dbFilePath && dbData) {
    fs.writeFileSync(dbFilePath, JSON.stringify(dbData, null, 2), 'utf-8');
  }
}

function getDb() {
  if (!dbData) {
    initDatabase();
  }
  return dbData;
}

function newId() {
  return uuidv4();
}

function now() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function findById(collectionName, id) {
  const collection = dbData[collectionName];
  if (!collection) return null;
  return collection.find(item => item.id === id) || null;
}

function findAll(collectionName) {
  return dbData[collectionName] || [];
}

function insert(collectionName, data) {
  if (!dbData[collectionName]) {
    dbData[collectionName] = [];
  }
  const record = {
    ...data,
    id: data.id || newId(),
    created_at: data.created_at || now(),
    updated_at: data.updated_at || now()
  };
  dbData[collectionName].push(record);
  saveData();
  return record;
}

function update(collectionName, id, data) {
  const collection = dbData[collectionName];
  if (!collection) return null;
  
  const index = collection.findIndex(item => item.id === id);
  if (index === -1) return null;
  
  collection[index] = {
    ...collection[index],
    ...data,
    updated_at: now()
  };
  saveData();
  return collection[index];
}

function remove(collectionName, id) {
  const collection = dbData[collectionName];
  if (!collection) return false;
  
  const index = collection.findIndex(item => item.id === id);
  if (index === -1) return false;
  
  collection.splice(index, 1);
  saveData();
  return true;
}

function filter(collectionName, predicate) {
  const collection = dbData[collectionName] || [];
  return collection.filter(predicate);
}

function findOne(collectionName, predicate) {
  const collection = dbData[collectionName] || [];
  return collection.find(predicate) || null;
}

function count(collectionName, predicate) {
  const items = filter(collectionName, predicate);
  return items.length;
}

module.exports = {
  initDatabase,
  getDb,
  newId,
  now,
  findById,
  findAll,
  insert,
  update,
  remove,
  filter,
  findOne,
  count
};
