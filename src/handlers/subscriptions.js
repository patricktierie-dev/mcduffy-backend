/**
 * Subscriptions Handler
 * Retrieves customer subscriptions from Shopify and PayMongo
 */

const https = require('https');

// Shopify credentials from environment
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP || 'mcduffytemporary.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// PayMongo credentials
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
 * Search for subscription orders by email
 * Searches for orders with subscription-related tags OR PayMongo payments
 */
async function findSubscriptionOrders(email) {
  const query = `
    query($query: String!) {
      orders(first: 50, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            tags
            note
            customAttributes {
              key
              value
            }
            lineItems(first: 5) {
              edges {
                node {
                  title
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `;

  // Search by email only first, then filter
  const variables = {
    query: `email:${email}`
  };

  try {
    const result = await shopifyGraphQL(query, variables);

    console.log('[Subscriptions] GraphQL response:', JSON.stringify(result, null, 2));

    if (result.errors) {
      console.error('Shopify GraphQL errors:', result.errors);
      return [];
    }

    const allOrders = result.data?.orders?.edges?.map(e => e.node) || [];
    console.log(`[Subscriptions] Found ${allOrders.length} total orders for ${email}`);

    // Filter for subscription-related orders
    // Look for: subscription tag, PayMongo tag, or subscription in note
    const subscriptionOrders = allOrders.filter(order => {
      const tags = order.tags || [];
      const note = (order.note || '').toLowerCase();
      const lineItems = order.lineItems?.edges || [];

      // Check tags for subscription indicators
      const hasSubscriptionTag = tags.some(tag =>
        tag.toLowerCase().includes('subscription') ||
        tag.toLowerCase().includes('paymongo') ||
        tag.toLowerCase().includes('recurring')
      );

      // Check note for PayMongo or subscription indicators
      const hasSubscriptionNote = note.includes('paymongo') ||
                                   note.includes('subscription') ||
                                   note.includes('recurring');

      // Check if it's McDuffy food (subscription product)
      const hasMcDuffyFood = lineItems.some(item => {
        const title = (item.node?.title || '').toLowerCase();
        return title.includes('mcduffy') ||
               title.includes('fresh') ||
               title.includes('gently cooked') ||
               title.includes('home cooked') ||
               title.includes('dog food');
      });

      console.log(`[Subscriptions] Order ${order.name}: tags=${tags.join(',')}, hasSubTag=${hasSubscriptionTag}, hasSubNote=${hasSubscriptionNote}, hasMcDuffyFood=${hasMcDuffyFood}`);

      return hasSubscriptionTag || hasSubscriptionNote || hasMcDuffyFood;
    });

    console.log(`[Subscriptions] Filtered to ${subscriptionOrders.length} subscription orders`);

    return subscriptionOrders;
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

/**
 * Get subscription details from PayMongo
 * Note: PayMongo doesn't have a "list subscriptions by email" endpoint,
 * so we'll use the order metadata to find subscription IDs
 */
async function getPayMongoSubscription(subscriptionId) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(PAYMONGO_SECRET + ':').toString('base64');

    const options = {
      hostname: 'api.paymongo.com',
      port: 443,
      path: `/v1/subscriptions/${subscriptionId}`,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.data || null);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.end();
  });
}

/**
 * Transform Shopify orders into subscription format for the frontend
 */
function transformToSubscriptions(orders) {
  return orders.map(order => {
    // Extract subscription info from tags and custom attributes
    const tags = order.tags || [];
    const attrs = order.customAttributes || [];

    // Find recipe from attributes or line items
    let recipe = null;
    let provider = 'card'; // default
    let paymongoSubscriptionId = null;

    attrs.forEach(attr => {
      if (attr.key === 'recipe') recipe = attr.value;
      if (attr.key === 'provider') provider = attr.value;
      // PayMongo subscription ID is stored here when subscription is created
      if (attr.key === 'subscription_id' || attr.key === 'paymongo_subscription_id') {
        paymongoSubscriptionId = attr.value;
      }
    });

    // Get plan name from first line item
    const firstItem = order.lineItems?.edges?.[0]?.node;
    const planName = firstItem?.title || 'McDuffy Subscription';

    // Determine status (simplified - would need PayMongo check for real status)
    let status = 'active';
    if (tags.includes('cancelled')) status = 'cancelled';
    if (tags.includes('paused')) status = 'suspended';

    // Use Shopify order ID as the main identifier for actions
    const shopifyOrderId = order.id.replace('gid://shopify/Order/', '');

    return {
      id: shopifyOrderId, // Shopify order ID for tagging/notes
      order_id: order.id,
      order_name: order.name,
      paymongo_subscription_id: paymongoSubscriptionId, // PayMongo ID for cancellation
      status: status,
      provider: provider,
      recipe: recipe,
      plan_name: planName,
      amount: Math.round(parseFloat(order.totalPriceSet?.shopMoney?.amount || 0) * 100),
      currency: order.totalPriceSet?.shopMoney?.currencyCode || 'PHP',
      created_at: order.createdAt,
      next_billing_date: calculateNextBillingDate(order.createdAt)
    };
  });
}

/**
 * Calculate next billing date (30 days from creation, repeating monthly)
 */
function calculateNextBillingDate(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();

  // Find the next billing date after today
  let nextBilling = new Date(created);
  while (nextBilling <= now) {
    nextBilling.setMonth(nextBilling.getMonth() + 1);
  }

  return nextBilling.toISOString();
}

/**
 * GET /api/subscriptions?email=...
 * Returns list of subscriptions for the given email
 */
module.exports = function subscriptionsHandler() {
  return async (req, res) => {
    try {
      const email = req.query.email;

      if (!email) {
        return res.status(400).json({
          error: 'Email is required',
          subscriptions: []
        });
      }

      console.log(`[Subscriptions] Looking up subscriptions for: ${email}`);

      // Find subscription orders in Shopify
      const orders = await findSubscriptionOrders(email);

      console.log(`[Subscriptions] Found ${orders.length} subscription orders`);

      // Transform to subscription format
      const subscriptions = transformToSubscriptions(orders);

      return res.json({
        success: true,
        email: email,
        subscriptions: subscriptions
      });

    } catch (error) {
      console.error('[Subscriptions] Error:', error);
      return res.status(500).json({
        error: 'Failed to load subscriptions',
        subscriptions: []
      });
    }
  };
};
