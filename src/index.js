require('dotenv').config();
const express = require('express');

const subscribeHandler = require('./handlers/subscribe');
const webhookHandler = require('./handlers/webhook');
const createOrderHandler = require('./handlers/createOrder');
const subscriptionsHandler = require('./handlers/subscriptions');
const {
  pauseSubscription,
  resumeSubscription,
  skipSubscription,
  cancelSubscription
} = require('./handlers/subscriptionActions');

const app = express();

// ----- CORS (keep) -----
const ALLOW = new Set([
  'https://mcduffy.co',
  'https://www.mcduffy.co',
  'https://mcduffytemporary.myshopify.com'
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOW.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ----- WEBHOOK FIRST: raw body only for this route -----
app.post(
  '/api/paymongo/webhook',
  express.raw({ type: 'application/json' }),   // PayMongo sends application/json
  webhookHandler()
);

// ----- JSON parser for normal APIs (after webhook) -----
app.use(express.json());

// Subscribe route (normal JSON)
app.post('/api/paymongo/subscribe', subscribeHandler());

// Create Shopify order after payment verification (fallback for webhook)
app.post('/api/shopify/create-order', createOrderHandler());

// Get subscriptions for account management
app.get('/api/subscriptions', subscriptionsHandler());

// Subscription actions (pause, resume, skip, cancel)
app.post('/api/subscriptions/:id/pause', pauseSubscription);
app.post('/api/subscriptions/:id/resume', resumeSubscription);
app.post('/api/subscriptions/:id/skip', skipSubscription);
app.post('/api/subscriptions/:id/cancel', cancelSubscription);

// Health
app.get('/healthz', (_req, res) => res.send('ok'));

// Start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Listening on :${PORT}`));
