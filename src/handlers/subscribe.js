// src/handlers/subscribe.js  (CommonJS)
const paymongo = require('../paymongo');   // your existing helper (secret key inside)
const shopify  = require('../shopify');    // optional if you use it here

function pick(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

module.exports = function subscribeHandler() {
  return async function handler(req, res) {
    try {
      const { customer, plan, shopifyOrder } = req.body || {};

      // Basic validation
      if (!customer || !plan) {
        return res.status(400).json({ error: 'missing_fields', detail: 'customer and plan are required' });
      }

      // 1) Create or reuse Plan
      const pmPlan = await paymongo.createPlan(plan); // must return { id, attributes: ... }

      // 2) Create or reuse Customer
      const pmCustomer = await paymongo.getOrCreateCustomer(customer); // must return { id, attributes: ... }

      // 3) Create Subscription (without payment method yet)
      const pmSub = await paymongo.createSubscription({
        customerId: pmCustomer.id,
        planId: pmPlan.id
        // any other attributes your helper needs (e.g., start_at, metadata)
      });

      // 4) Extract Payment Intent + client_key for browser 3DS
      // Try a few shapes to be robust to helper differences
      const paymentIntentId =
        pick(pmSub, 'attributes.latest_invoice.payment_intent_id') ||
        pick(pmSub, 'attributes.latest_invoice.payment_intent.id') ||
        pick(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent_id') ||
        pick(pmSub, 'data.attributes.latest_invoice.data.id');

      const clientKey =
        pick(pmSub, 'attributes.latest_invoice.payment_intent.attributes.client_key') ||
        pick(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.attributes.client_key') ||
        pick(pmSub, 'attributes.client_key');

      if (!paymentIntentId || !clientKey) {
        return res.status(400).json({
          error: 'missing_payment_intent',
          detail: 'Could not find payment intent/client_key on subscription',
          raw: pmSub
        });
      }

      // 5) Optionally persist mapping for your webhook de-dupe
      // await store.save({ paymentIntentId, subscriptionId: pmSub.id });

      // 6) Optionally construct a draft Shopify order payload to send later in the webhook
      // Not required here; webhook should create the paid order.

      res.json({
        subscriptionId: pmSub.id || pick(pmSub, 'data.id'),
        paymentIntentId,
        clientKey
      });
    } catch (err) {
      console.error('subscribe error', err);
      const detail = err?.errors || err?.message || err;
      res.status(400).json({ error: 'subscribe failed', detail });
    }
  };
};
