// src/handlers/subscribe.js
const paymongo = require('../paymongo');
const { saveBlueprint } = require('../store'); // optional but useful

const get = (o, p) => p.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), o);

function normalizePH(phone) {
  if (!phone) return '';
  let d = String(phone).replace(/[^\d+]/g, '');
  if (d.startsWith('+63')) return d;
  d = d.replace(/^0+/, '');
  if (d.startsWith('63')) return '+' + d;
  return '+63' + d;
}

module.exports = function subscribeHandler() {
  return async function handler(req, res) {
    try {
      const { customer, plan, shopifyOrder } = req.body || {};

      // validate input
      if (!customer || !customer.email) {
        return res.status(400).json({ error: 'missing_fields', detail: 'customer.email is required' });
      }
      const phone = normalizePH(customer.phone || '');
      if (phone && !/^\+63\d{10}$/.test(phone)) {
        return res.status(400).json({ error: 'phone_invalid', detail: 'Use +63 followed by 10 digits (e.g. +639171234567)' });
      }

      if (!plan || !Number.isFinite(plan.amount)) {
        return res.status(400).json({ error: 'missing_fields', detail: 'plan.amount (centavos) is required' });
      }

      // defaults per PayMongo spec
      const planReq = {
        name: plan.name || 'McDuffy Plan',
        description: plan.description || 'McDuffy subscription',
        amount: plan.amount,
        currency: plan.currency || 'PHP',
        interval: plan.interval || 'month',
        interval_count: plan.interval_count || 1
      };

      // 1) Create Plan
      let pmPlan;
      try {
        pmPlan = await paymongo.createPlan(planReq);
      } catch (e) {
        return res.status(400).json({ error: 'plan_create_failed', detail: e.body || e.message || e });
      }
      const planId = pmPlan?.id || get(pmPlan, 'data.id');
      if (!planId) return res.status(400).json({ error: 'plan_create_failed', detail: pmPlan });

      // 2) Create Customer
      let pmCustomer;
      try {
        pmCustomer = await paymongo.createCustomer({
          email: customer.email,
          first_name: customer.first_name || '',
          last_name: customer.last_name || '',
          phone
        });
      } catch (e) {
        return res.status(400).json({ error: 'customer_create_failed', detail: e.body || e.message || e });
      }
      const customerId = pmCustomer?.id || get(pmCustomer, 'data.id');
      if (!customerId) return res.status(400).json({ error: 'customer_create_failed', detail: pmCustomer });

      // 3) Create Subscription (this creates latest_invoice + payment_intent)
      let pmSub;
      try {
        pmSub = await paymongo.createSubscription({ customerId, planId });
      } catch (e) {
        return res.status(400).json({ error: 'subscription_create_failed', detail: e.body || e.message || e });
      }

      const subscriptionId = pmSub?.id || get(pmSub, 'data.id');

      // 4) Extract Payment Intent id + client_key
      // PayMongo responses vary in nesting; handle both.
      const piId =
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.data.id') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.id') ||
        get(pmSub, 'attributes.latest_invoice.payment_intent.id') ||
        get(pmSub, 'attributes.latest_invoice.payment_intent_id');

      let clientKey =
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.data.attributes.client_key') ||
        get(pmSub, 'data.attributes.latest_invoice.data.attributes.payment_intent.attributes.client_key') ||
        get(pmSub, 'attributes.latest_invoice.payment_intent.attributes.client_key');

      // fallback: fetch PI to read client_key
      if (!clientKey && piId) {
        try {
          const pi = await paymongo.getPaymentIntent(piId);
          clientKey = get(pi, 'data.attributes.client_key') || get(pi, 'attributes.client_key');
        } catch (_) {}
      }

      if (!piId || !clientKey) {
        return res.status(400).json({
          error: 'missing_payment_intent',
          detail: 'PayMongo did not return payment_intent/client_key on subscription',
          raw: pmSub
        });
      }

      // optional: store blueprint for downstream order fulfillment
      try {
        await saveBlueprint(piId, { shopifyOrder: shopifyOrder || {}, subscriptionId, plan: planReq, customer });
      } catch (_) {}

      return res.json({ subscriptionId, paymentIntentId: piId, clientKey });
    } catch (err) {
      console.error('subscribe error', err);
      const detail =
        err?.body ||
        err?.errors ||
        err?.message ||
        (typeof err === 'string' ? err : 'subscribe_failed');
      return res.status(400).json({ error: 'subscribe_failed', detail });
    }
  };
};
