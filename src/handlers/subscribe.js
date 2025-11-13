// /src/handlers/subscribe.js
const paymongo = require('../paymongo');

// Optional store. If it's not there, we keep going.
let store = null;
try { store = require('../store'); } catch (_) { /* optional */ }

// Small safe getter
const get = (o, p) => p.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), o);

function toClientErrorPayload(err) {
  // Normalize to { error, detail, errors? }
  if (!err) return { error: 'unknown', detail: 'Unknown error' };
  if (err.errors && Array.isArray(err.errors) && err.errors.length) {
    const e = err.errors[0];
    const msg = e.detail || e.message || String(err.message || err);
    let suffix = '';
    const ptr = e.source && (e.source.pointer || e.source.attribute);
    if (ptr) suffix = ` (${ptr})`;
    return { error: e.code || 'paymongo_error', detail: msg + suffix, errors: err.errors };
  }
  return { error: err.code || 'error', detail: err.body || err.message || String(err) };
}

module.exports = function subscribeHandler() {
  return async function handler(req, res) {
    try {
      const { customer, plan, shopifyOrder } = req.body || {};

      // ---- Validation
      if (!customer || !customer.email) {
        return res.status(400).json({ error: 'missing_fields', detail: 'customer.email is required' });
      }
      if (customer.phone) {
        const ok = /^\+63\d{10}$/.test(customer.phone);
        if (!ok) return res.status(400).json({ error: 'phone_invalid', detail: 'Use +63 followed by 10 digits (e.g. +639171234567)' });
      }

      if (!plan || !Number.isFinite(plan.amount) || plan.amount <= 0) {
        return res.status(400).json({ error: 'missing_fields', detail: 'plan.amount (centavos) is required and must be > 0' });
      }

      // Normalize plan fields for PayMongo
      const planPayload = {
        name: plan.name || 'McDuffy Plan',
        description: plan.description || 'Gently cooked subscription',
        amount: Math.round(Number(plan.amount)),      // centavos
        currency: plan.currency || 'PHP',
        interval: (plan.interval === 'monthly') ? 'month' :
                  (plan.interval === 'weekly')  ? 'week'  :
                  (plan.interval || 'month'),
        interval_count: plan.interval_count || 1
      };

      // ---- 1) Create Plan
      let pmPlan;
      try {
        pmPlan = await paymongo.createPlan(planPayload);
      } catch (e) {
        return res.status(400).json({ error: 'plan_create_failed', ...toClientErrorPayload(e) });
      }
      const planId = pmPlan?.id || get(pmPlan, 'data.id');
      if (!planId) return res.status(400).json({ error: 'plan_create_failed', detail: 'Missing plan id from PayMongo', raw: pmPlan });

      // ---- 2) Create Customer
      let pmCustomer;
      try {
        pmCustomer = await paymongo.createCustomer({
          email: customer.email,
          first_name: customer.first_name || customer.firstName || '',
          last_name:  customer.last_name  || customer.lastName  || '',
          phone: customer.phone || null
        });
      } catch (e) {
        return res.status(400).json({ error: 'customer_create_failed', ...toClientErrorPayload(e) });
      }
      const customerId = pmCustomer?.id || get(pmCustomer, 'data.id');
      if (!customerId) return res.status(400).json({ error: 'customer_create_failed', detail: 'Missing customer id from PayMongo', raw: pmCustomer });

      // ---- 3) Create Subscription -> latest_invoice -> payment_intent
      let pmSub;
      try {
        pmSub = await paymongo.createSubscription({ customerId, planId });
      } catch (e) {
        return res.status(400).json({ error: 'subscription_create_failed', ...toClientErrorPayload(e) });
      }

      const subscriptionId = pmSub?.id || get(pmSub, 'data.id');

      // Typical nesting variants seen from PayMongo
      const piId =
        get(pmSub, 'attributes.latest_invoice.payment_intent.id') ||
        get(pmSub, 'attributes.latest_invoice.payment_intent_id') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.id') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent_id');

      let clientKey =
        get(pmSub, 'attributes.latest_invoice.payment_intent.attributes.client_key') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.attributes.client_key');

      // Fetch PI if client_key missing
      if (piId && !clientKey) {
        try {
          const pi = await paymongo.getPaymentIntent(piId);
          clientKey = get(pi, 'data.attributes.client_key') || get(pi, 'attributes.client_key');
        } catch (_) { /* if this fails we error below */ }
      }

      if (!piId || !clientKey) {
        return res.status(400).json({
          error: 'missing_payment_intent',
          detail: 'PayMongo did not return payment_intent/client_key on subscription',
          raw: pmSub
        });
      }

      // Optional: persist blueprint so you can fulfill when you get webhooks
      if (store && typeof store.saveBlueprint === 'function') {
        try {
          await store.saveBlueprint(piId, { subscriptionId, customer, plan: planPayload, shopifyOrder });
        } catch (_) { /* do not block success */ }
      }

      return res.json({ subscriptionId, paymentIntentId: piId, clientKey });
    } catch (err) {
      console.error('subscribe error', err);
      const payload = toClientErrorPayload(err);
      return res.status(400).json({ error: 'subscribe_failed', ...payload });
    }
  };
};
