// src/index.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOW = process.env.CORS_ORIGIN || '*';

app.use(morgan('tiny'));
app.use(express.json());

// very simple CORS – lock this down later
app.use(cors({
  origin: (origin, cb) => cb(null, ALLOW === '*' ? true : (origin && origin.includes(ALLOW))),
  credentials: false
}));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const subscribeHandler = require('./handlers/subscribe');
app.post('/api/paymongo/subscribe', subscribeHandler());

app.listen(PORT, () => console.log(`mcduffy backend listening on ${PORT}`));
