require('dotenv').config();
const express = require('express');

const subscribeHandler = require('./handlers/subscribe');
const webhookHandler = require('./handlers/webhook');

const app = express();

const cors = require('cors');

const ALLOW = [
  'https://mcduffy.co',
  'https://www.mcduffy.co',
  'https://mcduffytemporary.myshopify.com',
];

// reflect only allowed origins
const corsOptions = {
  origin(origin, cb) {
    // allow same-origin/no Origin (curl/healthz) and allowed domains
    if (!origin || ALLOW.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // cache preflight for a day
  optionsSuccessStatus: 204
};

// CORS must be the first middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle all preflights


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
