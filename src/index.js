require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

const subscribe = require('./handlers/subscribe');
const webhook = require('./handlers/webhook');

const app = express();

// CORS: allow your shop domains + local dev
const allowedFromEnv = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const allowAllShopify = /\.myshopify\.com$/i;

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const hostname = origin.replace(/^https?:\/\//, '');
    const okByEnv = allowedFromEnv.some(d => hostname === d || hostname.endsWith(`.${d}`));
    const okShopify = allowAllShopify.test(hostname);
    const okLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostname);
    if (okByEnv || okShopify || okLocal) return cb(null, true);
    return cb(null, false);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// PayMongo endpoints
app.post('/api/paymongo/subscribe', subscribe.createPaymentIntent);
app.post('/api/paymongo/webhook', express.raw({ type: '*/*' }), webhook.handleWebhook);

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`mcduffy-backend listening on :${PORT}`);
});
