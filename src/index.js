// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const subscribeHandler = require('./handlers/subscribe');
const webhookHandler   = require('./handlers/webhook');

const app = express();

// ----- CORS allowlist -----
const ALLOW = [
  'https://mcduffy.co',
  'https://www.mcduffy.co',
  'https://mcduffytemporary.myshopify.com',
];

// ----- CORS options -----
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);                 // curl/healthz
    if (ALLOW.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
  optionsSuccessStatus: 204
};

// ----- CORS must come first -----
app.use(cors(corsOptions));
// (Removed: app.options('*', cors(corsOptions)))

// Optional: log CORS/preflight while debugging
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
app.post(
  '/api/paymongo/webhook',
  express.raw({ type: 'application/json' }),
  webhookHandler()
);

// ----- JSON parser for normal APIs (after webhook) -----
app.use(express.json());

// ----- Routes -----
app.post('/api/paymongo/subscribe', subscribeHandler());

// Health
app.get('/healthz', (_req, res) => res.send('ok'));

// Start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Listening on :${PORT}`));
