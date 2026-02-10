/**
 * Dog Profiles Handler
 * Stores and retrieves dog profile data linked by email
 * Data is stored in Shopify customer metafields for persistence
 */

const https = require('https');

// Shopify credentials
const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP || 'mcduffytemporary.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// In-memory cache for dog profiles (backup if Shopify metafield fails)
// In production, use Redis or a database
const profileCache = new Map();

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
 * Find or create customer by email
 */
async function findOrCreateCustomer(email) {
  // First, try to find existing customer
  const findQuery = `
    query($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            email
            metafield(namespace: "mcduffy", key: "dog_profile") {
              value
            }
          }
        }
      }
    }
  `;

  const findResult = await shopifyGraphQL(findQuery, { query: `email:${email}` });

  if (findResult.data?.customers?.edges?.length > 0) {
    return findResult.data.customers.edges[0].node;
  }

  // Create new customer if not found
  const createMutation = `
    mutation customerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const createResult = await shopifyGraphQL(createMutation, {
    input: {
      email: email,
      tags: ['dog_profile', 'prospect']
    }
  });

  if (createResult.data?.customerCreate?.customer) {
    return createResult.data.customerCreate.customer;
  }

  return null;
}

/**
 * Save dog profile to Shopify customer metafield
 */
async function saveProfileToShopify(customerId, profileData) {
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          key
          namespace
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphQL(mutation, {
    metafields: [{
      ownerId: customerId,
      namespace: 'mcduffy',
      key: 'dog_profile',
      type: 'json',
      value: JSON.stringify(profileData)
    }]
  });

  return !result.data?.metafieldsSet?.userErrors?.length;
}

/**
 * GET /api/dog-profiles?email=...
 * Retrieves dog profile for the given email
 */
async function getDogProfile(req, res) {
  try {
    const email = req.query.email;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`[DogProfiles] Getting profile for: ${email}`);

    // Check cache first
    if (profileCache.has(email)) {
      console.log(`[DogProfiles] Found in cache`);
      return res.json(profileCache.get(email));
    }

    // Try Shopify customer metafield
    const customer = await findOrCreateCustomer(email);

    if (customer?.metafield?.value) {
      const profile = JSON.parse(customer.metafield.value);
      console.log(`[DogProfiles] Found in Shopify metafield`);

      // Cache it
      profileCache.set(email, profile);

      return res.json(profile);
    }

    console.log(`[DogProfiles] No profile found`);
    return res.status(404).json({ error: 'Profile not found' });

  } catch (error) {
    console.error('[DogProfiles] GET Error:', error);
    return res.status(500).json({ error: 'Failed to get profile' });
  }
}

/**
 * POST /api/dog-profiles
 * Saves dog profile for the given email
 */
async function saveDogProfile(req, res) {
  try {
    const { email, dog_name, dog_age, dog_age_unit, dog_weight_kg,
            body_condition, activity_level, allergies,
            preferred_protein, preferred_plan } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`[DogProfiles] Saving profile for: ${email}`);

    const profileData = {
      email,
      dog_name: dog_name || '',
      dog_age: dog_age || 0,
      dog_age_unit: dog_age_unit || 'years',
      dog_weight_kg: dog_weight_kg || 0,
      body_condition: body_condition || 'ideal',
      activity_level: activity_level || 'moderate',
      allergies: allergies || [],
      preferred_protein: preferred_protein || 'surf_turf',
      preferred_plan: preferred_plan || 'full',
      updated_at: new Date().toISOString()
    };

    // Save to cache immediately (fast response)
    profileCache.set(email, profileData);

    // Try to save to Shopify customer metafield (async, don't wait)
    findOrCreateCustomer(email)
      .then(customer => {
        if (customer?.id) {
          return saveProfileToShopify(customer.id, profileData);
        }
      })
      .then(success => {
        if (success) {
          console.log(`[DogProfiles] Saved to Shopify metafield for ${email}`);
        }
      })
      .catch(err => {
        console.error(`[DogProfiles] Shopify save failed:`, err.message);
      });

    console.log(`[DogProfiles] Profile saved to cache`);
    return res.json({ success: true, profile: profileData });

  } catch (error) {
    console.error('[DogProfiles] POST Error:', error);
    return res.status(500).json({ error: 'Failed to save profile' });
  }
}

module.exports = {
  getDogProfile,
  saveDogProfile
};
