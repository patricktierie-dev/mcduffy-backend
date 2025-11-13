const fs = require('fs-extra');
const path = require('path');

const DB = path.join(__dirname, '../../data.json');

async function readDB() {
  try { return await fs.readJson(DB); } catch { return { payments:{}, intents:{}, subs:{} }; }
}
async function writeDB(obj) { await fs.outputJson(DB, obj, { spaces: 2 }); }

// mark paymentId or paymentIntentId processed
async function markProcessed({ paymentId, paymentIntentId, orderId }) {
  const db = await readDB();
  if (paymentId) db.payments[paymentId] = { orderId, at: Date.now() };
  if (paymentIntentId) db.intents[paymentIntentId] = { orderId, at: Date.now() };
  await writeDB(db);
}
async function isProcessed({ paymentId, paymentIntentId }) {
  const db = await readDB();
  if (paymentId && db.payments[paymentId]) return true;
  if (paymentIntentId && db.intents[paymentIntentId]) return true;
  return false;
}

// For lookup: we’ll save the Shopify order blueprint keyed by the Payment Intent id we hand back to the browser.
async function saveBlueprint(paymentIntentId, blueprint) {
  const db = await readDB();
  db.subs[paymentIntentId] = blueprint;
  await writeDB(db);
}
async function getBlueprint(paymentIntentId) {
  const db = await readDB();
  return db.subs[paymentIntentId];
}

module.exports = { markProcessed, isProcessed, saveBlueprint, getBlueprint };
