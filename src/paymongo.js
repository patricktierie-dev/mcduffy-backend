// src/paymongo.js
// Node CJS module
const axios = require('axios');

const BASE = 'https://api.paymongo.com/v1';
const SK = process.env.PAYMONGO_SECRET_KEY || ''; // sk_test_... or sk_live_...

function authHeader(key) {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

const api = axios.create({
  baseURL: BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(cfg => {
  if (!SK) {
    const e = new Error('PAYMONGO_SECRET_KEY not set');
    e.errors = [{ code: 'config', detail: 'PAYMONGO_SECRET_KEY missing' }];
    throw e;
  }
  cfg.headers.Authorization = authHeader(SK);
  return cfg;
});

function unwrapAxiosError(err) {
  if (err?.response?.data) return err.response.data;
  if (err?.response?.statusText) return { errors: [{ detail: err.response.statusText }] };
  if (err?.message) return { errors: [{ detail: err.message }] };
  return { errors: [{ detail: 'Unknown error' }] };
}

module.exports = {
  // Plans live under /v1/subscriptions/plans (not /plans).
  // interval should be 'day' | 'week' | 'month' | 'year' (use 'month' + interval_count:1).
  async createPlan({ name, description, amount, currency = 'PHP', interval = 'month', interval_count = 1 }) {
    const body = { data: { attributes: { name, description, amount, currency, interval, interval_count } } };
    try {
      const { data } = await api.post('/subscriptions/plans', body);
      return { id: data?.data?.id, ...data };
    } catch (err) {
      const e = new Error('plan_create_failed');
      e.body = unwrapAxiosError(err);
      throw e;
    }
  },

  // Keep attributes simple. Do NOT send default_device.
  async createCustomer({ email, first_name, last_name, phone }) {
    const body = { data: { attributes: { email, first_name, last_name, phone } } };
    try {
      const { data } = await api.post('/customers', body);
      return { id: data?.data?.id, ...data };
    } catch (err) {
      const e = new Error('customer_create_failed');
      e.body = unwrapAxiosError(err);
      throw e;
    }
  },

  // Subscriptions live under /v1/subscriptions and expect customer_id + plan_id.
  async createSubscription({ customerId, planId }) {
    const body = { data: { attributes: { customer_id: customerId, plan_id: planId } } };
    try {
      const { data } = await api.post('/subscriptions', body);
      return { id: data?.data?.id, ...data };
    } catch (err) {
      const e = new Error('subscription_create_failed');
      e.body = unwrapAxiosError(err);
      throw e;
    }
  },

  async getPaymentIntent(id) {
    try {
      const { data } = await api.get(`/payment_intents/${id}`);
      return data;
    } catch (err) {
      const e = new Error('pi_get_failed');
      e.body = unwrapAxiosError(err);
      throw e;
    }
  }
};
