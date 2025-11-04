const { v4: uuid } = require('uuid');
const {
  createPlan, createCustomer, findCustomersByEmail,
  createSubscription, retrievePaymentIntent
} = require('../paymongo');
const { saveBlueprint } = require('../utils/store');

/**
 * Input (JSON body) – very explicit for Gently Cooked:
 * {
 *   "customer": { "email": "...", "first_name": "...", "last_name": "...", "phone": "+63..." },
 *   "plan": { "id": "plan_...", OR "name": "...", "description": "...", "amount": 123400, "currency": "PHP", "interval": "monthly", "interval_count": 1 },
 *   "shopifyOrder": {
 *      "currency": "PHP",
 *      "email": "...",
 *      "lineItems": [
 *         // OPTION A (custom item)
 *         { "title": "Mcduffy Gently Home Cooked Dog Food — Chicken 2kg (monthly)", "quantity": 1,
 *           "priceSet": { "shopMoney": { "amount": 2499.00, "currencyCode": "PHP" } } }
 *         // OPTION B (real inventory)
 *         // { "variantId": "gid://shopify/ProductVariant/1234567890", "quantity": 1 }
 *      ],
 *      "amount": 2499.00,
 *      "note": "PayMongo subscription link",
 *      "tags": ["subscription","PayMongo"],
 *      "shippingAddress": { "firstName": "...", "lastName": "...", "address1":"...", "city":"...", "country":"PH", "zip":"..." }
 *   }
 * }
 */
module.exports = function subscribeHandler() {
  return async (req, res) => {
    try {
      const { customer, plan, shopifyOrder } = req.body || {};
      if (!customer?.email) return res.status(400).json({ error: 'customer.email is required' });
      if (!shopifyOrder?.currency || !shopifyOrder?.lineItems || !shopifyOrder?.amount)
        return res.status(400).json({ error: 'shopifyOrder.currency, lineItems, amount are required' });

      // 1) Ensure a PayMongo customer exists (reuse by email)
      let customerId;
      const existing = await findCustomersByEmail(customer.email);
      if (existing.length) {
        customerId = existing[0].id;
      } else {
        const c = await createCustomer(customer);
        customerId = c.id;
      }

      // 2) Ensure plan
      let planId;
      if (plan?.id) {
        planId = plan.id;
      } else {
        if (!plan?.name || !plan?.amount) return res.status(400).json({ error: 'plan.id OR (plan.name & plan.amount) required' });
        const p = await createPlan(plan);
        planId = p.id;
      }

      // 3) Create subscription (generates latest_invoice & payment_intent)
      const sub = await createSubscription({ customer_id: customerId, plan_id: planId });

      // 4) Grab payment intent id and client_key for the browser to attach the card
      const piId = sub.attributes?.latest_invoice?.payment_intent?.id;
      if (!piId) return res.status(500).json({ error: 'No payment_intent found on subscription.latest_invoice' });

      const pi = await retrievePaymentIntent(piId);
      const clientKey = pi.attributes?.client_key;
      if (!clientKey) return res.status(500).json({ error: 'Payment Intent missing client_key' });

      // 5) Save a "blueprint" we’ll need when webhook confirms payment
      await saveBlueprint(piId, {
        shopifyOrder,
        subscriptionId: sub.id,
        planId,
        customerId
      });

      // Send to browser; your front-end will create a Payment Method and attach using this client_key
      return res.json({
        subscriptionId: sub.id,
        paymentIntentId: piId,
        clientKey
      });
    } catch (err) {
      console.error(err.response?.data || err);
      return res.status(500).json({ error: 'subscribe failed', detail: err.response?.data || err.message });
    }
  };
};
