const { verifyPaymongoSignature } = require('../utils/verifyPaymongoSignature');
const { isProcessed, markProcessed, getBlueprint } = require('../utils/store');
const { createPaidOrder } = require('../shopify');

exports.handleWebhook = async (req, res) => {
  try {
    // Optionally verify signature with PAYMONGO_WEBHOOK_SECRET.
    res.status(200).json({ received: true });
  } catch (e) {
    res.status(200).json({ received: true });
  }
};

module.exports = function webhookHandler() {
  return async (req, res) => {
    const rawBody = req.body; // raw Buffer (see index.js for express.raw)
    const header = req.get('Paymongo-Signature');
    const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
    let event;

    // 1) Parse JSON early to detect livemode in payload
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('invalid json');
    }
    const isLive = !!event?.data?.attributes?.livemode;

    // 2) Verify signature (HMAC SHA-256)
    if (!verifyPaymongoSignature(header, rawBody, secret, isLive)) {
      return res.status(400).send('invalid signature');
    }

    // 3) Pull the event type and relevant ids
    const type = event?.data?.attributes?.type;
    // In payment.paid events, the resource is a payment; try to extract paymentIntent id defensively
    const payment = event?.data?.attributes?.data; // usually {id,type,attributes:{...}}
    const paymentId = payment?.id;
    const piId =
      payment?.attributes?.payment_intent_id ||
      payment?.attributes?.payment_intent?.id ||
      payment?.attributes?.payment_intentId ||
      null;

    // 4) We only care about successful charges here
    if (type === 'payment.paid') {
      try {
        if (await isProcessed({ paymentId, paymentIntentId: piId })) {
          // Already handled (retry), acknowledge fast
          return res.status(200).send('ok');
        }

        // 5) Load blueprint we stored at subscribe-time by Payment Intent id
        const blueprint = await getBlueprint(piId);
        if (!blueprint) {
          // No blueprint; nothing to build the order with. Log and ack to stop retries; you can reconcile later by admin.
          console.error('No blueprint found for PI', piId);
          return res.status(200).send('ok');
        }

        const { shopifyOrder } = blueprint;

        // 6) Create paid Shopify order
        const order = await createPaidOrder({
          currency: shopifyOrder.currency,
          email: shopifyOrder.email,
          lineItems: shopifyOrder.lineItems,
          amount: shopifyOrder.amount,
          note: (shopifyOrder.note || '') + ` | PayMongo payment: ${paymentId || ''}`,
          tags: (shopifyOrder.tags || []).concat(['PayMongo']),
          shippingAddress: shopifyOrder.shippingAddress
        });

        // 7) Mark processed to avoid duplicates on webhook retries
        await markProcessed({ paymentId, paymentIntentId: piId, orderId: order?.id });

        return res.status(200).send('ok');
      } catch (err) {
        console.error('webhook payment.paid handler error', err.response?.data || err);
        // Still return 200 to avoid infinite retries if it’s non-recoverable; log and fix.
        return res.status(200).send('ok');
      }
    }

    // Optionally handle payment.failed to notify customers or mark subscription issues
    if (type === 'payment.failed') {
      // your logic here (email customer, flag account, etc.)
      return res.status(200).send('ok');
    }

    // Acknowledge unhandled types
    return res.status(200).send('ok');
  };
};
