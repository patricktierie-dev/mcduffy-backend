/**
 * Subscription Actions Handler
 * Handles pause, resume, skip, and cancel actions for subscriptions
 *
 * IMPORTANT: PayMongo subscriptions can only be CANCELLED, not paused or skipped.
 * Pause/Skip actions only update Shopify tags for internal tracking.
 * Cancel MUST call PayMongo API to stop recurring charges.
 */

const https = require('https');

// Shopify credentials
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP || 'mcduffytemporary.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY;

/**
 * Makes a GraphQL request to Shopify
 */
async function shopifyGraphQL(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query, variables });

    const options = {
      hostname: SHOPIFY_SHOP,
      port: 443,
      path: '/admin/api/2024-01/graphql.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON from Shopify'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Cancel a PayMongo subscription
 * This STOPS recurring charges
 */
async function cancelPayMongoSubscription(subscriptionId, reason = 'other') {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(PAYMONGO_SECRET + ':').toString('base64');
    const postData = JSON.stringify({
      data: {
        attributes: {
          cancellation_reason: reason
        }
      }
    });

    const options = {
      hostname: 'api.paymongo.com',
      port: 443,
      path: `/v1/subscriptions/${subscriptionId}/cancel`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`[SubscriptionActions] Calling PayMongo cancel: ${options.path}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('[SubscriptionActions] PayMongo cancel response:', JSON.stringify(parsed, null, 2));

          if (parsed.errors) {
            reject(new Error(parsed.errors[0]?.detail || 'PayMongo error'));
          } else {
            resolve(parsed.data);
          }
        } catch (e) {
          reject(new Error('Invalid JSON from PayMongo'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Get order details to find PayMongo subscription ID
 */
async function getOrderWithSubscriptionId(orderId) {
  const gid = orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;

  const query = `
    query($id: ID!) {
      order(id: $id) {
        id
        tags
        note
        customAttributes {
          key
          value
        }
      }
    }
  `;

  const result = await shopifyGraphQL(query, { id: gid });
  return result.data?.order;
}

/**
 * Add a tag to an order
 */
async function addOrderTag(orderId, tag) {
  const gid = orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;

  const mutation = `
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node {
          ... on Order {
            id
            tags
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphQL(mutation, { id: gid, tags: [tag] });
  console.log('[SubscriptionActions] Add tag result:', JSON.stringify(result, null, 2));

  if (result.data?.tagsAdd?.userErrors?.length > 0) {
    throw new Error(result.data.tagsAdd.userErrors[0].message);
  }

  return result;
}

/**
 * Remove a tag from an order
 */
async function removeOrderTag(orderId, tag) {
  const gid = orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;

  const mutation = `
    mutation tagsRemove($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        node {
          ... on Order {
            id
            tags
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphQL(mutation, { id: gid, tags: [tag] });
  console.log('[SubscriptionActions] Remove tag result:', JSON.stringify(result, null, 2));

  return result;
}

/**
 * Add a note to an order
 */
async function updateOrderNote(orderId, note) {
  const gid = orderId.startsWith('gid://') ? orderId : `gid://shopify/Order/${orderId}`;

  const mutation = `
    mutation orderUpdate($input: OrderInput!) {
      orderUpdate(input: $input) {
        order {
          id
          note
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphQL(mutation, {
    input: {
      id: gid,
      note: note
    }
  });

  console.log('[SubscriptionActions] Update note result:', JSON.stringify(result, null, 2));

  return result;
}

/**
 * POST /api/subscriptions/:id/pause
 *
 * NOTE: PayMongo does NOT support pausing subscriptions.
 * This only updates Shopify tags for internal tracking.
 * The customer will continue to be charged!
 *
 * TODO: Consider cancelling the PayMongo subscription and creating a new one when resuming.
 */
async function pauseSubscription(req, res) {
  const { id } = req.params;
  const { email, paymongoSubscriptionId } = req.body || {};

  console.log(`[SubscriptionActions] Pausing subscription ${id} for ${email}`);
  console.log(`[SubscriptionActions] WARNING: PayMongo does not support pause. Only updating Shopify tags.`);

  try {
    // Add 'paused' tag to the order
    await addOrderTag(id, 'paused');
    await removeOrderTag(id, 'active');

    // Add note about pause
    const pauseDate = new Date().toISOString();
    await updateOrderNote(id, `Subscription paused by customer on ${pauseDate}. NOTE: PayMongo subscription is still active - manual cancellation may be needed.`);

    return res.json({
      success: true,
      message: 'Subscription paused successfully. Note: Contact support if you need to stop charges.',
      status: 'paused',
      warning: 'PayMongo does not support pausing. Contact support to fully stop charges.'
    });
  } catch (error) {
    console.error('[SubscriptionActions] Pause error:', error);
    return res.status(500).json({
      error: 'Failed to pause subscription',
      message: error.message
    });
  }
}

/**
 * POST /api/subscriptions/:id/resume
 */
async function resumeSubscription(req, res) {
  const { id } = req.params;
  const { email } = req.body || {};

  console.log(`[SubscriptionActions] Resuming subscription ${id} for ${email}`);

  try {
    // Remove 'paused' tag and add 'active'
    await removeOrderTag(id, 'paused');
    await addOrderTag(id, 'active');

    // Add note about resume
    const resumeDate = new Date().toISOString();
    await updateOrderNote(id, `Subscription resumed by customer on ${resumeDate}`);

    return res.json({
      success: true,
      message: 'Subscription resumed successfully',
      status: 'active'
    });
  } catch (error) {
    console.error('[SubscriptionActions] Resume error:', error);
    return res.status(500).json({
      error: 'Failed to resume subscription',
      message: error.message
    });
  }
}

/**
 * POST /api/subscriptions/:id/skip
 *
 * NOTE: PayMongo does NOT support skipping.
 * This only updates Shopify tags for internal tracking.
 */
async function skipSubscription(req, res) {
  const { id } = req.params;
  const { email } = req.body || {};

  console.log(`[SubscriptionActions] Skipping next delivery for ${id}`);
  console.log(`[SubscriptionActions] WARNING: PayMongo does not support skip. Only updating Shopify tags.`);

  try {
    // Add 'skipped-next' tag
    await addOrderTag(id, 'skipped-next');

    // Add note about skip
    const skipDate = new Date().toISOString();
    await updateOrderNote(id, `Next delivery skipped by customer on ${skipDate}. NOTE: Payment may still process - manual adjustment needed.`);

    return res.json({
      success: true,
      message: 'Next delivery marked as skipped. Our team will adjust your order.',
      warning: 'Payment schedule unchanged. Our team will process any refunds if needed.'
    });
  } catch (error) {
    console.error('[SubscriptionActions] Skip error:', error);
    return res.status(500).json({
      error: 'Failed to skip delivery',
      message: error.message
    });
  }
}

/**
 * POST /api/subscriptions/:id/cancel
 *
 * This ACTUALLY cancels the PayMongo subscription to stop future charges.
 */
async function cancelSubscription(req, res) {
  const { id } = req.params;
  const { email, paymongoSubscriptionId, reason } = req.body || {};

  console.log(`[SubscriptionActions] Cancelling subscription ${id} for ${email}`);
  console.log(`[SubscriptionActions] PayMongo subscription ID: ${paymongoSubscriptionId}`);

  try {
    // 1. Try to cancel in PayMongo first (if we have the subscription ID)
    let paymongoCancelled = false;

    if (paymongoSubscriptionId) {
      try {
        // Map reason to PayMongo's expected values
        const paymongoReason = reason || 'other';
        // Valid values: 'too_expensive', 'missing_features', 'switched_service', 'unused', 'other'

        await cancelPayMongoSubscription(paymongoSubscriptionId, paymongoReason);
        paymongoCancelled = true;
        console.log(`[SubscriptionActions] Successfully cancelled PayMongo subscription: ${paymongoSubscriptionId}`);
      } catch (pmError) {
        console.error(`[SubscriptionActions] Failed to cancel PayMongo subscription:`, pmError.message);
        // Continue to update Shopify tags even if PayMongo fails
        // The subscription might already be cancelled or the ID might be wrong
      }
    } else {
      console.log(`[SubscriptionActions] No PayMongo subscription ID provided. Only updating Shopify.`);
    }

    // 2. Update Shopify order tags
    await addOrderTag(id, 'cancelled');
    await removeOrderTag(id, 'active');
    await removeOrderTag(id, 'paused');

    // 3. Add note about cancellation
    const cancelDate = new Date().toISOString();
    const noteText = paymongoCancelled
      ? `Subscription cancelled by customer on ${cancelDate}. PayMongo subscription (${paymongoSubscriptionId}) also cancelled.`
      : `Subscription cancelled by customer on ${cancelDate}. NOTE: PayMongo subscription may need manual cancellation.`;

    await updateOrderNote(id, noteText);

    return res.json({
      success: true,
      message: paymongoCancelled
        ? 'Subscription cancelled successfully. No further charges will occur.'
        : 'Subscription marked as cancelled. Please contact support to confirm no further charges.',
      status: 'cancelled',
      paymongoCancelled: paymongoCancelled
    });
  } catch (error) {
    console.error('[SubscriptionActions] Cancel error:', error);
    return res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error.message
    });
  }
}

module.exports = {
  pauseSubscription,
  resumeSubscription,
  skipSubscription,
  cancelSubscription
};
