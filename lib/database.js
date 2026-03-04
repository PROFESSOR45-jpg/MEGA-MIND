const fs = require('fs-extra');
const DB_FILE = './database.json';

async function initDB() {
  if (!await fs.pathExists(DB_FILE)) {
    await fs.writeJson(DB_FILE, {
      bannedUsers: [],
      bannedGroups: [],
      warnings: {}
    });
  }
  return await fs.readJson(DB_FILE);
}

async function saveDB(data) {
  await fs.writeJson(DB_FILE, data, { spaces: 2 });
}

async function banUser(number, reason = 'No reason', bannedBy = 'owner') {
  const db = await initDB();
  const userId = number.includes('@') ? number : number + '@s.whatsapp.net';
  
  if (db.bannedUsers.find(u => u.id === userId)) {
    return { success: false, message: 'User already banned' };
  }
  
  db.bannedUsers.push({
    id: userId,
    number: number.replace('@s.whatsapp.net', ''),
    reason,
    bannedBy,
    bannedAt: new Date().toISOString()
  });
  
  await saveDB(db);
  return { success: true, message: 'User banned successfully' };
}

async function unbanUser(number) {
  const db = await initDB();
  const userId = number.includes('@') ? number : number + '@s.whatsapp.net';
  
  const index = db.bannedUsers.findIndex(u => u.id === userId);
  if (index === -1) return { success: false, message: 'User not banned' };
  
  db.bannedUsers.splice(index, 1);
  await saveDB(db);
  return { success: true, message: 'User unbanned successfully' };
}

async function isBannedUser(number) {
  const db = await initDB();
  const userId = number.includes('@') ? number : number + '@s.whatsapp.net';
  return db.bannedUsers.find(u => u.id === userId);
}

async function banGroup(groupId, reason = 'No reason', bannedBy = 'owner') {
  const db = await initDB();
  const gid = groupId.includes('@') ? groupId : groupId + '@g.us';
  
  if (db.bannedGroups.find(g => g.id === gid)) {
    return { success: false, message: 'Group already banned' };
  }
  
  db.bannedGroups.push({
    id: gid,
    reason,
    bannedBy,
    bannedAt: new Date().toISOString()
  });
  
  await saveDB(db);
  return { success: true, message: 'Group banned successfully' };
}

async function unbanGroup(groupId) {
  const db = await initDB();
  const gid = groupId.includes('@') ? groupId : groupId + '@g.us';
  
  const index = db.bannedGroups.findIndex(g => g.id === gid);
  if (index === -1) return { success: false, message: 'Group not banned' };
  
  db.bannedGroups.splice(index, 1);
  await saveDB(db);
  return { success: true, message: 'Group unbanned successfully' };
}

async function isBannedGroup(groupId) {
  const db = await initDB();
  const gid = groupId.includes('@') ? groupId : groupId + '@g.us';
  return db.bannedGroups.find(g => g.id === gid);
}

async function getBannedList() {
  const db = await initDB();
  return { users: db.bannedUsers, groups: db.bannedGroups };
}

async function addWarning(userId) {
  const db = await initDB();
  if (!db.warnings[userId]) db.warnings[userId] = 0;
  db.warnings[userId]++;
  await saveDB(db);
  return db.warnings[userId];
}

async function getWarnings(userId) {
  const db = await initDB();
  return db.warnings[userId] || 0;
}

async function clearWarnings(userId) {
  const db = await initDB();
  delete db.warnings[userId];
  await saveDB(db);
}

module.exports = {
  initDB, banUser, unbanUser, isBannedUser,
  banGroup, unbanGroup, isBannedGroup, getBannedList,
  addWarning, getWarnings, clearWarnings
};

