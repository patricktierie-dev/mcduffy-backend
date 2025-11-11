// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const subscribeHandler = require('./handlers/subscribe');
const webhookHandler = require('./handlers/webhook');

const app = express();

// ----- CORS allowlist -----
const ALLOW = [
  'https://mcduffy.co',
  'https://www.mcduffy.co',
  'https://mcduffytemporary.myshopify.com',
];

// ----- CORS options (robust) -----
const corsOptions = {
  origin(origin, cb) {
    // Allow server-to-server (no Origin) and the whitelisted sites
    if (!origin) return cb(null, true);
    if (ALLOW.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  // Do not hardcode allowedHeaders — cors will mirror what browser requests
  maxAge: 86400, // cache preflight 24h
  optionsSuccessStatus: 204,
};

// ----- CORS must come first -----
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Optional: log CORS traffic for debugging
app.use((req, _res, next) => {
  if (req.method === 'OPTIONS' || req.path === '/api/paymongo/subscribe') {
    console.log('CORS', {
      method: req.method,
      path: req.path,
      origin: req.headers.origin,
      acrm: req.headers['access-control-request-method'],
      acrh: req.headers['access-control-request-headers'],
    });
  }
  next();
});

// ----- WEBHOOK FIRST: raw body only for this route -----
// PayMongo requires the raw body to verify signatures.
// This must appear BEFORE express.json().
app.post(
  '/api/paymongo/webhook',
  express.raw({ type: 'application/json' }),
  webhookHandler()
);

// ----- JSON parser for normal APIs (after webhook) -----
app.use(express.json());

// ----- Subscription route (normal JSON) -----
app.post('/api/paymongo/subscribe', subscribeHandler());

// ----- Health check -----
app.get('/healthz', (_req, res) => res.send('ok'));

// ----- Start server -----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Listening on :${PORT}`));
