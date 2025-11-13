// src/store.js
const fs = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, '../../data.json');

async function readDB() {
  try { return await fs.readJson(DB); } catch { return { payments:{}, intents:{}, subs:{} }; }
}
async function writeDB(obj) { await writeDB.last?.(); await fs.outputJson(DB, obj, { spaces: 2 }); }
writeDB.last = null;

async function markProcessed({ paymentId, paymentIntentId, orderId }) {
  const db = await readDB();
  if (paymentId) db.payments[paymentId] = { orderId, at: Date.now() };
  if (paymentIntentId) db.intents[paymentIntentId] = { orderId, at: Date.now() };
  writeDB.last = () => fs.outputJson(DB, db, { spaces: 2 });
  await writeDB.last();
}
async function isProcessed({ paymentId, paymentIntentId }) {
  const db = await readDB();
  if (paymentId && db.payments[paymentId]) return true;
  if (paymentIntentId && db.intents[paymentIntentId]) return true;
  return false;
}
async function saveBlueprint(paymentIntentId, blueprint) {
  const db = await readDB();
  db.subs[paymentIntentId] = blueprint;
  await fs.outputJson(DB, db, { spaces: 2 });
}
async function getBlueprint(paymentIntentId) {
  const db = await readDB();
  return db.subs[paymentIntentId];
}

module.exports = { markProcessed, isProcessed, saveBlueprint, getBlueprint };
