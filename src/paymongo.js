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

function post(path, data, idemKey = uuid()) {
  return PM.post(path, data, {
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey
    }
  });
}

function get(path) {
  return PM.get(path, { headers: { 'Authorization': authHeader() } });
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

/* ---------- PAYMONGO ---------- */

// Plan
async function createPlan({ name, description, amount, currency = 'PHP', interval = 'monthly', interval_count = 1, cycle_count = null }) {
  const payload = {
    data: {
      attributes: { name, description, amount, currency, interval, interval_count }
    }
  };
  if (cycle_count != null) payload.data.attributes.cycle_count = cycle_count;
  const { data } = await post('/subscriptions/plans', payload);
  return data.data;
}

// Customer (fixed: default_device + strict phone format)
function toE164PlusCountry10(phoneRaw) {
  if (!phoneRaw) return undefined;
  // strip non-digits, remember if it had a leading +
  const hadPlus = /^\+/.test(phoneRaw);
  const digits = phoneRaw.replace(/\D/g, '');
  // If already starts with 63 and has 12 digits, keep; else try to coerce PH format
  let withCC = digits.startsWith('63') ? digits : ('63' + digits.replace(/^0+/, ''));
  // Enforce exactly +63 + 10 digits
  withCC = withCC.slice(0, 12); // '63' + 10 digits = 12
  return '+' + withCC; // total length 13 inc '+'
}

async function createCustomer({ email, first_name, last_name, phone }) {
  const phoneE164 = toE164PlusCountry10(phone);
  const payload = {
    data: {
      attributes: {
        email,
        first_name,
        last_name,
        phone: phoneE164,           // e.g., +639170000000
        default_device: "phone"     // required: "phone" or "email"
      }
    }
  };
  const { data } = await post('/customers', payload);
  return data.data;
}

// Find customer by email
async function findCustomersByEmail(email) {
  const { data } = await get(`/customers?email=${encodeURIComponent(email)}`);
  return data.data || [];
}

// Subscription
async function createSubscription({ customer_id, plan_id }) {
  const payload = { data: { attributes: { customer_id, plan_id } } };
  const { data } = await post('/subscriptions', payload);
  return data.data;
}

// Retrieve Subscription
async function retrieveSubscription(id) {
  const { data } = await get(`/subscriptions/${id}`);
  return data.data;
}

// Retrieve Payment Intent (client_key)
async function retrievePaymentIntent(id) {
  const { data } = await get(`/payment_intents/${id}`);
  return data.data;
}

module.exports = {
  createPlan,
  createCustomer,
  findCustomersByEmail,
  createSubscription,
  retrieveSubscription,
  retrievePaymentIntent
};
