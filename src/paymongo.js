const axios = require('axios');
const { v4: uuid } = require('uuid');

const PM = axios.create({
  baseURL: 'https://api.paymongo.com/v1',
  timeout: 10000
});

function authHeader() {
  const sk = process.env.PAYMONGO_SECRET_KEY;
  if (!sk) throw new Error('PAYMONGO_SECRET_KEY is missing');
  return 'Basic ' + Buffer.from(sk + ':').toString('base64');
}

// helpers add standard headers; include Idempotency-Key on POST/PUT to be safe
function post(path, data, idemKey = uuid()) {
  return PM.post(path, data, {
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey // safe retries if network flakes
    }
  });
}
function get(path) {
  return PM.get(path, {
    headers: { 'Authorization': authHeader() }
  });
}
function put(path, data, idemKey = uuid()) {
  return PM.put(path, data, {
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey
    }
  });
}

// --- Plans ---
async function createPlan({ name, description, amount, currency = 'PHP', interval = 'monthly', interval_count = 1, cycle_count = null }) {
  const payload = {
    data: {
      attributes: { name, description, amount, currency, interval, interval_count }
    }
  };
  if (cycle_count != null) payload.data.attributes.cycle_count = cycle_count;

  const { data } = await post('/subscriptions/plans', payload);
  return data.data; // {id, attributes...}
}

// --- Customers ---
async function createCustomer({ email, first_name, last_name, phone }) {
  const payload = {
    data: { attributes: { email, first_name, last_name, phone } }
  };
  const { data } = await post('/customers', payload);
  return data.data; // {id, attributes...}
}

// retrieve existing customer(s) by email if you prefer re-use
async function findCustomersByEmail(email) {
  const { data } = await get(`/customers?email=${encodeURIComponent(email)}`);
  return data.data || [];
}

// --- Subscriptions ---
async function createSubscription({ customer_id, plan_id }) {
  const payload = { data: { attributes: { customer_id, plan_id } } };
  const { data } = await post('/subscriptions', payload);
  return data.data; // includes latest_invoice.payment_intent.id
}

async function retrieveSubscription(id) {
  const { data } = await get(`/subscriptions/${id}`);
  return data.data;
}

// --- Payment Intents (to grab client_key) ---
async function retrievePaymentIntent(id) {
  const { data } = await get(`/payment_intents/${id}`);
  return data.data; // attributes.client_key etc.
}

module.exports = {
  createPlan,
  createCustomer,
  findCustomersByEmail,
  createSubscription,
  retrieveSubscription,
  retrievePaymentIntent
};
