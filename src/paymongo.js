const BASE = 'https://api.paymongo.com/v1';

function pmAuthHeader() {
  const sk = process.env.PAYMONGO_SECRET_KEY;
  if (!sk) return null;
  const token = Buffer.from(`${sk}:`).toString('base64');
  return `Basic ${token}`;
}

exports.subscribe = async function subscribe(req, res) {
  try {
    const auth = pmAuthHeader();
    if (!auth) {
      return res.status(500).json({
        errors: [{ detail: 'PAYMONGO_SECRET_KEY not configured on server' }]
      });
    }

    const { plan } = req.body || {};
    const amount = Number(plan && plan.amount);

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        errors: [{ detail: 'Invalid plan.amount (must be centavos integer > 0)' }]
      });
    }

    const name = (plan && plan.name) || 'McDuffy Subscription';

    // Create a Payment Intent for card, 3DS automatic
    const payload = {
      data: {
        attributes: {
          amount,
          currency: 'PHP',
          payment_method_allowed: ['card'],
          payment_method_options: { card: { request_three_d_secure: 'automatic' } },
          capture_type: 'automatic',
          description: name,
          statement_descriptor: 'MCDUFFY'
        }
      }
    };

    const r = await fetch(`${BASE}/payment_intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // bubble up PayMongo’s error structure so the frontend can toast it
      return res.status(r.status).json(j);
    }

    const paymentIntentId = j?.data?.id;
    const clientKey = j?.data?.attributes?.client_key;

    if (!paymentIntentId || !clientKey) {
      return res.status(502).json({
        errors: [{ detail: 'PayMongo response missing id/client_key' }]
      });
    }

    return res.json({ paymentIntentId, clientKey });
  } catch (err) {
    console.error('subscribe handler error', err);
    return res.status(500).json({
      errors: [{ detail: 'Server error creating payment intent' }]
    });
  }
};
