require('dotenv').config();
const express = require('express');

const subscribeHandler = require('./handlers/subscribe');
const webhookHandler = require('./handlers/webhook');

const app = express();

// ----- CORS (keep) -----
// ----- CORS (fixed) -----
const ALLOW = [
  'https://mcduffy.co',
  'https://www.mcduffy.co',
  'https://mcduffytemporary.myshopify.com',
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOW.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  // reflect what browser asks
  const reqMethod  = req.headers['access-control-request-method'];
  const reqHeaders = req.headers['access-control-request-headers'];

  res.setHeader(
    'Access-Control-Allow-Methods',
    reqMethod ? reqMethod + ',OPTIONS' : 'GET,POST,OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    reqHeaders ? reqHeaders : 'Content-Type,Authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400'); // 1 day cache

  if (req.method === 'OPTIONS') {
    // end preflight cleanly
    return res.status(204).end();
  }
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

// Health
app.get('/healthz', (_req, res) => res.send('ok'));

// Start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Listening on :${PORT}`));
