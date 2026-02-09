const { isProcessed, markProcessed, getBlueprint } = require('../utils/store');
const { createPaidOrder } = require('../shopify');
const { retrievePaymentIntent } = require('../paymongo');

/**
 * Fallback endpoint to create Shopify order after payment verification
 * Called from the frontend after 3DS verification completes
 *
 * POST /api/shopify/create-order
 * Body: { paymentIntentId: "pi_xxx" }
 */
module.exports = function createOrderHandler() {
  return async (req, res) => {
    try {
      const { paymentIntentId } = req.body || {};

      if (!paymentIntentId) {
        return res.status(400).json({ error: 'paymentIntentId is required' });
      }

      // 1) Check if already processed (prevent duplicates)
      if (await isProcessed({ paymentIntentId })) {
        return res.json({ success: true, message: 'Order already created' });
      }

      // 2) Verify payment is actually successful with PayMongo
      const pi = await retrievePaymentIntent(paymentIntentId);
      const status = pi.attributes?.status;

      if (status !== 'succeeded') {
        return res.status(400).json({
          error: 'Payment not successful',
          status,
          message: status === 'awaiting_payment_method'
            ? 'Payment not yet completed'
            : `Payment status: ${status}`
        });
      }

      // 3) Get the blueprint saved during subscription
      const blueprint = await getBlueprint(paymentIntentId);

      if (!blueprint) {
        return res.status(404).json({
          error: 'Order blueprint not found',
          message: 'No order data found for this payment. Please contact support.'
        });
      }

      const { shopifyOrder } = blueprint;

      // 4) Create the Shopify order
      const order = await createPaidOrder({
        currency: shopifyOrder.currency,
        email: shopifyOrder.email,
        lineItems: shopifyOrder.lineItems,
        amount: shopifyOrder.amount,
        note: (shopifyOrder.note || '') + ` | PayMongo PI: ${paymentIntentId}`,
        tags: (shopifyOrder.tags || []).concat(['PayMongo', 'subscription-frontend']),
        shippingAddress: shopifyOrder.shippingAddress
      });

      // 5) Mark as processed
      await markProcessed({
        paymentIntentId,
        orderId: order?.id
      });

      console.log('Order created successfully:', order?.id, order?.name);

      return res.json({
        success: true,
        orderId: order?.id,
        orderName: order?.name,
        message: 'Order created successfully'
      });

    } catch (err) {
      console.error('createOrder error:', err.response?.data || err);
      return res.status(500).json({
        error: 'Failed to create order',
        detail: err.response?.data || err.message
      });
    }
  };
};
