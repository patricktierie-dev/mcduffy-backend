const axios = require('axios');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY; // sk_live_...
if (!PAYMONGO_SECRET_KEY) {
  console.warn('[warn] PAYMONGO_SECRET_KEY missing');
}

const api = axios.create({
  baseURL: 'https://api.paymongo.com/v1',
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64'),
    'Content-Type': 'application/json'
  },
  timeout: 15000
});

function asCents(n) {
  const cents = Math.round(Number(n) * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error('invalid_amount');
  return cents;
}

function mapError(err) {
  try {
    if (err.response && err.response.data) return err.response.data;
    return { message: err.message || 'Unknown error' };
  } catch {
    return { message: 'Unknown error' };
  }
}

/**
 * Create a PayMongo Payment Intent for cards, 3DS allowed.
 * Returns: { id, client_key }
 */
async function createCardPaymentIntent({ amountPHP, description, metadata }) {
  try {
    const body = {
      data: {
        attributes: {
          amount: asCents(amountPHP),
          payment_method_allowed: ['card'],
          payment_method_options: { card: { request_three_d_secure: 'any' } },
          currency: 'PHP',
          capture_type: 'automatic',
          description: description || 'McDuffy subscription',
          statement_descriptor: 'MCDUFFY',
          metadata: metadata || {}
        }
      }
    };
    const r = await api.post('/payment_intents', body);
    const d = r.data && r.data.data;
    return { id: d.id, client_key: d.attributes.client_key };
  } catch (err) {
    throw mapError(err);
  }
}

module.exports = { createCardPaymentIntent };
