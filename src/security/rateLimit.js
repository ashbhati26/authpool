const rateLimit = require("express-rate-limit");
const slowDown  = require("express-slow-down");

/**
 * @param {object} cfg
 * @param {import('ioredis').Redis|null} redisClient
 */
function createRateLimiters(cfg, redisClient = null) {
  let store;
  if (redisClient) {
    try {
      const { RedisStore } = require("rate-limit-redis");
      store = new RedisStore({ sendCommand: (...args) => redisClient.call(...args) });
      console.log("✅ Rate limiter using Redis store");
    } catch (_) {
      console.warn("⚠️  rate-limit-redis not found — using memory store for rate limiting.");
    }
  }

  const s = store ? { store } : {};

  // ── Global: every request ─────────────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: cfg.global.windowMs,
    max:      cfg.global.max,
    standardHeaders: true,
    legacyHeaders:   false,
    ...s,
    message: {
      error: "Too many requests, please try again later.",
      retryAfterSeconds: Math.ceil(cfg.global.windowMs / 1000),
    },
  });

  // ── Credential limiter: login + register only (strict) ───────────────────
  const credentialLimiter = rateLimit({
    windowMs: cfg.auth.windowMs,
    max:      cfg.auth.max,
    standardHeaders: true,
    legacyHeaders:   false,
    ...s,
    message: {
      error: "Too many authentication attempts, try again later.",
      retryAfterSeconds: Math.ceil(cfg.auth.windowMs / 1000),
    },
  });

  // ── Token limiter: refresh + logout-all (generous — not guessing creds) ──
  const tokenLimiter = rateLimit({
    windowMs: cfg.auth.windowMs,
    max:      60,
    standardHeaders: true,
    legacyHeaders:   false,
    ...s,
    message: {
      error: "Too many token requests, try again later.",
      retryAfterSeconds: Math.ceil(cfg.auth.windowMs / 1000),
    },
  });

  // ── Slowdown: only on credential routes ──────────────────────────────────
  const authSlowdown = slowDown({
    windowMs:   cfg.slowdown.windowMs,
    delayAfter: cfg.slowdown.delayAfter,
    delayMs:    () => cfg.slowdown.delayMs,
    ...s,
  });

  // authLimiter kept as alias so existing callers don't break
  return { globalLimiter, authLimiter: credentialLimiter, credentialLimiter, tokenLimiter, authSlowdown };
}

module.exports = { createRateLimiters };