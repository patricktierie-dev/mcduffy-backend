// src/handlers/subscribe.js
// CommonJS. No top-level await. All awaits live inside the async handler.

const paymongo = require('../paymongo'); // must export functions via module.exports

// Safe getter
function pick(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

// Resolve helper name differences without crashing
function fn(obj, names) {
  for (const n of names) if (typeof obj[n] === 'function') return obj[n].bind(obj);
  return null;
}

module.exports = function subscribeHandler() {
  return async function handler(req, res) {
    try {
      const { customer, plan, shopifyOrder } = req.body || {};

      if (!customer || !plan) {
        return res.status(400).json({
          error: 'missing_fields',
          detail: 'customer and plan are required'
        });
      }

      // ---- hook up to your paymongo helper ----
      const createPlan = fn(paymongo, ['createPlan', 'planCreate']);
      const createCustomer = fn(paymongo, ['getOrCreateCustomer', 'createCustomer', 'customerCreate']);
      const createSubscription = fn(paymongo, ['createSubscription', 'subscriptionCreate']);

      if (!createPlan || !createCustomer || !createSubscription) {
        throw new Error('paymongo helper is missing required functions');
      }

      // 1) Plan
      const pmPlan = await createPlan(plan);
      const planId = pmPlan?.id || pmPlan?.data?.id;
      if (!planId) throw new Error('planId_not_found');

      // 2) Customer
      const pmCustomer = await createCustomer(customer);
      const customerId = pmCustomer?.id || pmCustomer?.data?.id;
      if (!customerId) throw new Error('customerId_not_found');

      // 3) Subscription -> initial invoice -> Payment Intent
      const pmSub = await createSubscription({
        customerId,
        planId,
        metadata: { shopifyOrder: JSON.stringify(shopifyOrder || {}) }
      });

      const subscriptionId = pmSub?.id || pmSub?.data?.id;

      // 4) Extract Payment Intent + client_key for 3‑D Secure attach
      const paymentIntentId =
        pick(pmSub, 'attributes.latest_invoice.payment_intent.id') ||
        pick(pmSub, 'attributes.latest_invoice.payment_intent_id') ||
        pick(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.id') ||
        pick(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent_id') ||
        pmSub?.payment_intent_id;

      const clientKey =
        pick(pmSub, 'attributes.latest_invoice.payment_intent.attributes.client_key') ||
        pick(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.attributes.client_key') ||
        pmSub?.client_key;

      if (!paymentIntentId || !clientKey) {
        return res.status(400).json({
          error: 'missing_payment_intent',
          detail: 'Could not find payment intent/client_key on subscription',
          raw: pmSub
        });
      }

      return res.json({ subscriptionId, paymentIntentId, clientKey });
    } catch (err) {
      console.error('subscribe error', err);
      return res.status(400).json({
        error: 'subscribe_failed',
        detail: err?.errors || err?.message || String(err),
      });
    }
  };
};
