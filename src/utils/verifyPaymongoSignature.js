const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify PayMongo webhook signature.
 * Header example: "t=1716800978,te=<sig_for_test>,li=<sig_for_live>"
 * Build string: `${t}.${rawBody}` then HMAC-SHA256 with webhook secret.
 */
function verifyPaymongoSignature(header, rawBody, secret, isLive) {
  if (!header || !secret) return false;

  // parse header
  const parts = header.split(',').map(s => s.trim());
  const obj = {};
  for (const part of parts) {
    const [k, v] = part.split('=');
    obj[k] = v;
  }
  const timestamp = obj.t;
  const sentSig = isLive ? obj.li : obj.te;
  if (!timestamp || !sentSig) return false;

  const base = `${timestamp}.${rawBody}`;
  const calc = crypto.createHmac('sha256', secret).update(base).digest('hex');
  return timingSafeEqual(calc, sentSig);
}

module.exports = { verifyPaymongoSignature };
