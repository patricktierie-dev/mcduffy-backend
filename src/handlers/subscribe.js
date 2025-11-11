// src/handlers/subscribe.js
const paymongo = require('../paymongo');

// small safe getter
const get = (o, p) => p.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), o);

module.exports = function subscribeHandler() {
  return async function handler(req, res) {
    try {
      const { customer, plan, shopifyOrder } = req.body || {};

      // Basic validation so we fail fast with a clear message
      if (!customer || !customer.email) {
        return res.status(400).json({ error: 'missing_fields', detail: 'customer.email is required' });
      }
      // Phone optional, but if present enforce PayMongo format (+63 + 10 digits)
      if (customer.phone) {
        const ok = /^\+63\d{10}$/.test(customer.phone);
        if (!ok) {
          return res.status(400).json({ error: 'phone_invalid', detail: 'Use +63 followed by 10 digits (e.g. +639171234567)' });
        }
      }
      if (!plan || !Number.isFinite(plan.amount)) {
        return res.status(400).json({ error: 'missing_fields', detail: 'plan.amount (centavos) is required' });
      }
      if (!plan.currency) plan.currency = 'PHP';
      if (!plan.interval) plan.interval = 'monthly';
      if (!plan.interval_count) plan.interval_count = 1;

      // 1) Plan
      let pmPlan;
      try {
        pmPlan = await paymongo.createPlan(plan);
      } catch (e) {
        return res.status(400).json({ error: 'plan_create_failed', detail: e.errors || e.body || e.message || e });
      }
      const planId = pmPlan?.id || get(pmPlan, 'data.id');
      if (!planId) return res.status(400).json({ error: 'plan_create_failed', detail: pmPlan });

      // 2) Customer
      let pmCustomer;
      try {
        pmCustomer = await paymongo.createCustomer(customer);
      } catch (e) {
        return res.status(400).json({ error: 'customer_create_failed', detail: e.errors || e.body || e.message || e });
      }
      const customerId = pmCustomer?.id || get(pmCustomer, 'data.id');
      if (!customerId) return res.status(400).json({ error: 'customer_create_failed', detail: pmCustomer });

      // 3) Subscription (creates initial invoice -> PaymentIntent)
      let pmSub;
      try {
        pmSub = await paymongo.createSubscription({ customerId, planId });
      } catch (e) {
        return res.status(400).json({ error: 'subscription_create_failed', detail: e.errors || e.body || e.message || e });
      }

      const subscriptionId = pmSub?.id || get(pmSub, 'data.id');

      // 4) Extract PI + client_key for the browser to attach card + 3DS
      const paymentIntentId =
        get(pmSub, 'attributes.latest_invoice.payment_intent.id') ||
        get(pmSub, 'attributes.latest_invoice.payment_intent_id') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.id') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent_id');

      let clientKey =
        get(pmSub, 'attributes.latest_invoice.payment_intent.attributes.client_key') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.attributes.client_key');

      if (!clientKey && paymentIntentId) {
        // fetch PI to get client_key if the sub payload didn’t include it
        try {
          const pi = await paymongo.getPaymentIntent(paymentIntentId);
          clientKey = get(pi, 'data.attributes.client_key') || get(pi, 'attributes.client_key');
        } catch (e) {
          // ignore; handled below
        }
      }

      if (!paymentIntentId || !clientKey) {
        return res.status(400).json({
          error: 'missing_payment_intent',
          detail: 'PayMongo did not return payment_intent/client_key on subscription',
          raw: pmSub
        });
      }

      // Optional: stash any data you need to build a Shopify Order in the webhook
      // (If you implemented a store, you can save here.)

      return res.json({ subscriptionId, paymentIntentId, clientKey });
    } catch (err) {
      console.error('subscribe error', err);
      return res.status(400).json({
        error: 'subscribe_failed',
        detail: err?.errors || err?.body || err?.message || String(err),
      });
    }
  };
};
