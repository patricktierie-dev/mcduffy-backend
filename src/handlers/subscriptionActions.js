/**
 * Subscription Actions Handler
 * Handles pause, resume, skip, and cancel actions for subscriptions
 */

const https = require('https');

// Shopify credentials
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP || 'mcduffytemporary.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

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
 * Add a tag to an order
 */
async function addOrderTag(orderId, tag) {
  // Ensure proper GID format
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
 */
async function pauseSubscription(req, res) {
  const { id } = req.params;
  const { email } = req.body || {};

  console.log(`[SubscriptionActions] Pausing subscription ${id} for ${email}`);

  try {
    // Add 'paused' tag to the order
    await addOrderTag(id, 'paused');
    await removeOrderTag(id, 'active');

    // Add note about pause
    const pauseDate = new Date().toISOString();
    await updateOrderNote(id, `Subscription paused by customer on ${pauseDate}`);

    return res.json({
      success: true,
      message: 'Subscription paused successfully',
      status: 'paused'
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
 */
async function skipSubscription(req, res) {
  const { id } = req.params;
  const { email } = req.body || {};

  console.log(`[SubscriptionActions] Skipping next delivery for ${id}`);

  try {
    // Add 'skipped-next' tag
    await addOrderTag(id, 'skipped-next');

    // Add note about skip
    const skipDate = new Date().toISOString();
    await updateOrderNote(id, `Next delivery skipped by customer on ${skipDate}`);

    return res.json({
      success: true,
      message: 'Next delivery skipped successfully'
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
 */
async function cancelSubscription(req, res) {
  const { id } = req.params;
  const { email } = req.body || {};

  console.log(`[SubscriptionActions] Cancelling subscription ${id} for ${email}`);

  try {
    // Add 'cancelled' tag
    await addOrderTag(id, 'cancelled');
    await removeOrderTag(id, 'active');
    await removeOrderTag(id, 'paused');

    // Add note about cancellation
    const cancelDate = new Date().toISOString();
    await updateOrderNote(id, `Subscription cancelled by customer on ${cancelDate}`);

    return res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      status: 'cancelled'
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
