const { createCardPaymentIntent } = require('../paymongo');

function first(v, fallback = '') {
  return (typeof v === 'string' && v.trim()) ? v.trim() : fallback;
}

exports.createPaymentIntent = async (req, res) => {
  try {
    const { customer, plan, shopifyOrder } = req.body || {};

    // Validate
    const email = first(customer && customer.email);
    const amountCentavos = Number(plan && plan.amount);
    if (!email) return res.status(400).json({ errors: [{ detail: 'Missing customer.email' }] });
    if (!Number.isFinite(amountCentavos) || amountCentavos <= 0) {
      return res.status(400).json({ errors: [{ detail: 'Invalid plan.amount' }] });
    }

    const amountPHP = amountCentavos / 100;
    const description = first(plan && plan.name, 'McDuffy subscription');
    const metadata = {
      customer_email: email,
      customer_name: `${first(customer.first_name)} ${first(customer.last_name)}`.trim(),
      phone: first(customer.phone),
      shopify_amount: first(shopifyOrder && shopifyOrder.amount),
      shopify_note: first(shopifyOrder && shopifyOrder.note),
      tags: Array.isArray(shopifyOrder && shopifyOrder.tags) ? shopifyOrder.tags.join(',') : undefined
    };

    const { id, client_key } = await createCardPaymentIntent({ amountPHP, description, metadata });
    return res.status(201).json({ paymentIntentId: id, clientKey: client_key });
  } catch (err) {
    return res.status(400).json(err);
  }
};
