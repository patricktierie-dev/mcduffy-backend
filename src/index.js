require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const subscribeHandler = require('./handlers/subscribe');
const webhookHandler = require('./handlers/webhook');

const app = express();

// CORS: only allow your store domains to call this API
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

// JSON for normal routes
app.use('/api', express.json());

// Webhook must read the RAW body to verify signature
app.post('/api/paymongo/webhook',
  bodyParser.raw({ type: '*/*' }),
  webhookHandler()
);

// Subscribe route: create plan/customer/subscription; return client_key
app.post('/api/paymongo/subscribe', subscribeHandler());

// health
app.get('/healthz', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on :${PORT}`));

