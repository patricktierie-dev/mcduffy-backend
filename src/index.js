require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const subscribeHandler = require('./handlers/subscribe');
const webhookHandler = require('./handlers/webhook');

const app = express();

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
