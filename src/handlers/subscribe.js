const { createCardPaymentIntent } = require('../paymongo');

function first(v, fallback = '') {
  return (typeof v === 'string' && v.trim()) ? v.trim() : fallback;
}

exports.createPaymentIntent = async (req, res) => {
  try {
    const { customer, plan, shopifyOrder } = req.body || {};

    // Minimal validation — don’t be permissive
    const email = first(customer && customer.email);
    const amount = Number((plan && plan.amount) || 0) / 100; // plan.amount is centavos from FE
    if (!email) return res.status(400).json({ errors: [{ detail: 'Missing customer.email' }] });
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ errors: [{ detail: 'Invalid plan.amount' }] });
    }

    const description = first(plan && plan.name, 'McDuffy subscription');
    const metadata = {
      customer_email: email,
      customer_name: `${first(customer.first_name)} ${first(customer.last_name)}`.trim(),
      phone: first(customer.phone),
      shopify_amount: first(shopifyOrder && shopifyOrder.amount),
      shopify_note: first(shopifyOrder && shopifyOrder.note),
      tags: Array.isArray(shopifyOrder && shopifyOrder.tags) ? (shopifyOrder.tags.join(',')) : undefined
    };

    const { id, client_key } = await createCardPaymentIntent({
      amountPHP: amount,
      description,
      metadata
    });

    return res.status(201).json({ paymentIntentId: id, clientKey: client_key });
  } catch (err) {
    // mirror PayMongo’s error shape so FE shows the real reason
    return res.status(400).json(err);
  }
};
