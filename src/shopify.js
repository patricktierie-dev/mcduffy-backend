const axios = require('axios');

function adminClient() {
  const shop = process.env.SHOPIFY_SHOP;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION || '2025-10';
  if (!shop || !token) throw new Error('Missing SHOPIFY_SHOP or SHOPIFY_ADMIN_ACCESS_TOKEN');

  const url = `https://${shop}/admin/api/${version}/graphql.json`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token
  };
  return { url, headers };
}

// Create a fully-paid order (custom item or with variantId)
// Minimal version, feel free to extend addresses, taxes, etc.
async function createPaidOrder({ currency, email, lineItems, amount, note, tags, shippingAddress }) {
  const { url, headers } = adminClient();

  const mutation = `
    mutation orderCreate($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        userErrors { field message }
        order { id name }
      }
    }
  `;

  // Map shippingAddress fields to Shopify's MailingAddressInput format
  // Frontend sends: { firstName, lastName, address1, address2, city, province, zip, country, phone }
  // Shopify expects: { firstName, lastName, address1, address2, city, provinceCode, zip, countryCode, phone }
  let mappedShippingAddress = null;
  if (shippingAddress) {
    mappedShippingAddress = {
      firstName: shippingAddress.firstName || '',
      lastName: shippingAddress.lastName || '',
      address1: shippingAddress.address1 || '',
      address2: shippingAddress.address2 || '',
      city: shippingAddress.city || '',
      provinceCode: shippingAddress.province || shippingAddress.provinceCode || 'Metro Manila',
      zip: shippingAddress.zip || '',
      countryCode: shippingAddress.country === 'PH' ? 'PH' : (shippingAddress.countryCode || 'PH'),
      phone: shippingAddress.phone || ''
    };
  }

  // The transaction marks it as paid.
  const variables = {
    order: {
      currency,
      email,
      lineItems, // e.g., [{ title, quantity, priceSet: { shopMoney: { amount, currencyCode }} }] OR with variantId
      transactions: [{
        kind: "SALE",
        status: "SUCCESS",
        amountSet: { shopMoney: { amount, currencyCode: currency } }
      }],
      note,
      tags,
      shippingAddress: mappedShippingAddress,
      billingAddress: mappedShippingAddress // Use same address for billing
    }
  };

  const { data } = await axios.post(url, { query: mutation, variables }, { headers });
  const errors = data?.data?.orderCreate?.userErrors;
  if (errors && errors.length) {
    throw new Error('Shopify orderCreate error: ' + JSON.stringify(errors));
  }
  return data?.data?.orderCreate?.order;
}

module.exports = { createPaidOrder };
