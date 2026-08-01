// BusCommand — bounded in-memory rate limiter (jedna instanca servera)

const MAX_TRACKED_IPS = 10000;

const _buckets = new Map();
let _limiterSequence = 0;

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function pruneIfNeeded() {
  if (_buckets.size <= MAX_TRACKED_IPS) return;
  const oldestKey = _buckets.keys().next().value;
  if (oldestKey !== undefined) _buckets.delete(oldestKey);
}

function rateLimit(maxAttempts = 5, windowMs = 5 * 60 * 1000) {
  const limiterId = ++_limiterSequence;
  return (req, res, next) => {
    const ip = getClientIp(req);
    const bucketKey = `${limiterId}:${ip}`;
    const now = Date.now();
    const rec = _buckets.get(bucketKey);

    if (rec && now < rec.resetAt) {
      if (rec.count >= maxAttempts) {
        const minutes = Math.ceil((rec.resetAt - now) / 60000);
        return res.status(429).json({
          success: false,
          error: `Previše pokušaja. Pokušajte za ${minutes} minuta.`
        });
      }
      rec.count += 1;
    } else {
      pruneIfNeeded();
      _buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    }
    next();
  };
}

function clearRateLimit(reqOrIp) {
  const ip = typeof reqOrIp === "string" ? reqOrIp : getClientIp(reqOrIp);
  for (const key of _buckets.keys()) {
    if (key.endsWith(`:${ip}`)) _buckets.delete(key);
  }
}

module.exports = { rateLimit, clearRateLimit, getClientIp };
