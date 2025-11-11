// src/paymongo.js
const BASE = 'https://api.paymongo.com/v1';
const SK = process.env.PAYMONGO_SECRET_KEY || ''; // sk_test_... or sk_live_...

function authHeader(key) {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

async function api(path, { method = 'GET', body } = {}) {
  if (!SK) {
    const e = new Error('PAYMONGO_SECRET_KEY not set');
    e.errors = [{ code: 'config', detail: 'PAYMONGO_SECRET_KEY missing' }];
    throw e;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Authorization': authHeader(SK), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try { json = await res.json(); } catch { json = null; }

  if (!res.ok) {
    const e = new Error(`paymongo_${res.status}`);
    e.status = res.status;
    e.body = json;
    e.errors = json?.errors || [{
      code: 'http_error',
      detail: json || res.statusText || 'HTTP error',
    }];
    throw e;
  }
  return json;
}

module.exports = {
  async createPlan({ name, description, amount, currency, interval, interval_count }) {
    const body = {
      data: { attributes: { name, description, amount, currency, interval, interval_count } }
    };
    const j = await api('/plans', { method: 'POST', body });
    return { id: j?.data?.id, ...j };
  },

  async createCustomer({ email, first_name, last_name, phone }) {
    const body = { data: { attributes: { email, first_name, last_name, phone } } };
    const j = await api('/customers', { method: 'POST', body });
    return { id: j?.data?.id, ...j };
  },

  async createSubscription({ customerId, planId }) {
    const body = { data: { attributes: { customer: customerId, plan: planId } } };
    const j = await api('/subscriptions', { method: 'POST', body });
    return { id: j?.data?.id, ...j };
  },

  async getPaymentIntent(id) {
    return api(`/payment_intents/${id}`, { method: 'GET' });
  }
};
