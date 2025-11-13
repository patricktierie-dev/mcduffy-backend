// /src/index.js
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Minimal CORS allowlist for Shopify storefront
const ALLOW_ORIGIN = process.env.CORS_ORIGIN || 'https://mcduffy.co';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '1mb' }));

const subscribeHandler = require('./handlers/subscribe');
app.post('/api/paymongo/subscribe', subscribeHandler());

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`mcduffy-backend listening on :${PORT}`);
});
