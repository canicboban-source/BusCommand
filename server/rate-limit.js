// BusCommand — bounded in-memory rate limiter (jedna instanca servera)

const MAX_TRACKED_IPS = 10000;

const _buckets = new Map();

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function pruneIfNeeded() {
  if (_buckets.size <= MAX_TRACKED_IPS) return;
  const oldestKey = _buckets.keys().next().value;
  if (oldestKey !== undefined) _buckets.delete(oldestKey);
}

function rateLimit(maxAttempts = 5, windowMs = 5 * 60 * 1000) {
  return (req, res, next) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const rec = _buckets.get(ip);

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
      _buckets.set(ip, { count: 1, resetAt: now + windowMs });
    }
    next();
  };
}

function clearRateLimit(reqOrIp) {
  const ip = typeof reqOrIp === "string" ? reqOrIp : getClientIp(reqOrIp);
  _buckets.delete(ip);
}

module.exports = { rateLimit, clearRateLimit, getClientIp };
