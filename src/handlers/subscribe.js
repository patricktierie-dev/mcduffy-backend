// src/handlers/subscribe.js
const paymongo = require('../paymongo');

// tiny safe getter
const get = (o, p) => p.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), o);

module.exports = function subscribeHandler() {
  return async function handler(req, res) {
    try {
      const { customer, plan /*, shopifyOrder */ } = req.body || {};

      // Fast validation
      if (!customer || !customer.email) {
        return res.status(400).json({ error: 'missing_fields', errors: [{ detail: 'customer.email is required' }] });
      }
      if (customer.phone && !/^\+63\d{10}$/.test(customer.phone)) {
        return res.status(400).json({ error: 'phone_invalid', errors: [{ detail: 'Use +63 followed by 10 digits (e.g. +639171234567)' }] });
      }
      if (!plan || !Number.isFinite(plan.amount)) {
        return res.status(400).json({ error: 'missing_fields', errors: [{ detail: 'plan.amount (centavos) is required' }] });
      }

      // Normalize interval for PayMongo
      plan.interval = plan.interval === 'monthly' ? 'month' : (plan.interval || 'month');
      plan.interval_count = plan.interval_count || 1;
      plan.currency = plan.currency || 'PHP';

      // 1) Plan
      let pmPlan;
      try { pmPlan = await paymongo.createPlan(plan); }
      catch (e) { return res.status(400).json({ error: 'plan_create_failed', errors: e.errors }); }
      const planId = pmPlan?.id || get(pmPlan, 'data.id');
      if (!planId) return res.status(400).json({ error: 'plan_create_failed', errors: [{ detail: 'No plan id' }] });

      // 2) Customer
      let pmCustomer;
      try { pmCustomer = await paymongo.createCustomer(customer); }
      catch (e) { return res.status(400).json({ error: 'customer_create_failed', errors: e.errors }); }
      const customerId = pmCustomer?.id || get(pmCustomer, 'data.id');
      if (!customerId) return res.status(400).json({ error: 'customer_create_failed', errors: [{ detail: 'No customer id' }] });

      // 3) Subscription (returns latest_invoice -> payment_intent)
      let pmSub;
      try { pmSub = await paymongo.createSubscription({ customerId, planId }); }
      catch (e) { return res.status(400).json({ error: 'subscription_create_failed', errors: e.errors }); }

      const subscriptionId = pmSub?.id || get(pmSub, 'data.id');

      const paymentIntentId =
        get(pmSub, 'attributes.latest_invoice.payment_intent.id') ||
        get(pmSub, 'attributes.latest_invoice.payment_intent_id') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.id') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent_id');

      let clientKey =
        get(pmSub, 'attributes.latest_invoice.payment_intent.attributes.client_key') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.attributes.client_key');

      if (!clientKey && paymentIntentId) {
        try {
          const pi = await paymongo.getPaymentIntent(paymentIntentId);
          clientKey = get(pi, 'data.attributes.client_key') || get(pi, 'attributes.client_key');
        } catch (e) { /* ignore */ }
      }

      if (!paymentIntentId || !clientKey) {
        return res.status(400).json({
          error: 'missing_payment_intent',
          errors: [{ detail: 'PayMongo did not return payment_intent or client_key' }],
          raw: pmSub
        });
      }

      return res.json({ subscriptionId, paymentIntentId, clientKey });
    } catch (err) {
      console.error('subscribe error', err);
      return res.status(400).json({
        error: 'subscribe_failed',
        errors: [{ detail: err?.message || String(err) }]
      });
    }
  };
};
