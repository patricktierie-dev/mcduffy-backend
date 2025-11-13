require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// middleware
app.use(morgan('tiny'));
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

// health
app.get('/health', (req, res) => res.json({ ok: true }));

// routes
const paymongo = require('./handlers/paymongo');
app.post('/api/paymongo/subscribe', paymongo.subscribe);
// helpful message if someone browses to it
app.get('/api/paymongo/subscribe', (req, res) => res.status(405).json({ error: 'Use POST' }));

// start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[mcduffy-backend] listening on :${PORT}`);
});
