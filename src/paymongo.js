// /src/paymongo.js
// Minimal PayMongo client using global fetch (Node 18+)
const BASE = 'https://api.paymongo.com/v1';
const SK = process.env.PAYMONGO_SECRET_KEY || ''; // sk_test_... or sk_live_...

function authHeader(key) {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

async function call(path, { method = 'GET', body } = {}) {
  if (!SK) {
    const e = new Error('PAYMONGO_SECRET_KEY is not set');
    e.errors = [{ code: 'config', detail: 'PAYMONGO_SECRET_KEY missing' }];
    throw e;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Authorization': authHeader(SK),
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let json = null;
  try { json = await res.json(); } catch (_) {}

  if (!res.ok) {
    const e = new Error(`paymongo_${res.status}`);
    e.status = res.status;
    // PayMongo returns { errors: [ { detail, source, code } ] }
    e.errors = json && json.errors ? json.errors : [{
      code: 'http_error',
      detail: json || res.statusText || 'HTTP error'
    }];
    e.body = json;
    throw e;
  }
  return json;
}

module.exports = {
  async createPlan({ name, description, amount, currency = 'PHP', interval = 'month', interval_count = 1 }) {
    // PayMongo expects 'month', NOT 'monthly'
    const normalizedInterval = (interval === 'monthly') ? 'month' :
                               (interval === 'weekly')  ? 'week'  : interval;
    const body = {
      data: {
        attributes: {
          name,
          description,
          amount,         // centavos (integer)
          currency,       // 'PHP'
          interval: normalizedInterval, // 'day' | 'week' | 'month' | 'year'
          interval_count  // integer
        }
      }
    };
    const j = await call('/plans', { method: 'POST', body });
    return { id: j?.data?.id, ...j };
  },

  async createCustomer({ email, first_name, last_name, phone }) {
    // DO NOT send any extra attributes. The following are accepted.
    const body = { data: { attributes: { email, first_name, last_name, phone } } };
    const j = await call('/customers', { method: 'POST', body });
    return { id: j?.data?.id, ...j };
  },

  async createSubscription({ customerId, planId }) {
    const body = { data: { attributes: { customer: customerId, plan: planId } } };
    const j = await call('/subscriptions', { method: 'POST', body });
    return { id: j?.data?.id, ...j };
  },

  async getPaymentIntent(id) {
    return call(`/payment_intents/${id}`, { method: 'GET' });
  }
};
