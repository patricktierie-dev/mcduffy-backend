// src/paymongo.js
const BASE = 'https://api.paymongo.com/v1';
const SK = process.env.PAYMONGO_SECRET_KEY;

function authHeader() {
  return 'Basic ' + Buffer.from(`${SK}:`).toString('base64');
}

async function api(path, { method = 'GET', body } = {}) {
  if (!SK) {
    const e = new Error('PAYMONGO_SECRET_KEY not set');
    e.errors = [{ code: 'config', detail: 'PAYMONGO_SECRET_KEY missing on server' }];
    throw e;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

  let json = null;
  try { json = await res.json(); } catch { json = null; }

  if (!res.ok) {
    const e = new Error(`paymongo_${res.status}`);
    e.status = res.status;
    e.errors = json?.errors || [{ code: 'http_error', detail: json || res.statusText }];
    throw e;
  }
  return json;
}

async function createPlan({ name, description, amount, currency, interval, interval_count }) {
  const payload = {
    data: { attributes: {
      name,
      description,
      amount: Number(amount),
      currency: currency || 'PHP',
      interval: interval === 'monthly' ? 'month' : (interval || 'month'),
      interval_count: interval_count || 1
    } }
  };
  const j = await api('/plans', { method: 'POST', body: payload });
  return { id: j?.data?.id, ...j };
}

async function createCustomer({ email, first_name, last_name, phone }) {
  const payload = { data: { attributes: { email, first_name, last_name, phone } } };
  const j = await api('/customers', { method: 'POST', body: payload });
  return { id: j?.data?.id, ...j };
}

async function createSubscription({ customerId, planId }) {
  const payload = { data: { attributes: { customer: customerId, plan: planId } } };
  const j = await api('/subscriptions', { method: 'POST', body: payload });
  return { id: j?.data?.id, ...j };
}

async function getPaymentIntent(id) {
  return api(`/payment_intents/${id}`, { method: 'GET' });
}

module.exports = { createPlan, createCustomer, createSubscription, getPaymentIntent };
