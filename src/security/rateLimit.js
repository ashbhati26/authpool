const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");

/**
 * Build limiters using caller-provided thresholds.
 * @param {{global:{windowMs:number,max:number},auth:{windowMs:number,max:number},slowdown:{windowMs:number,delayAfter:number,delayMs:number}}} cfg
 */
function createRateLimiters(cfg) {
  const globalLimiter = rateLimit({
    windowMs: cfg.global.windowMs,
    max: cfg.global.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many requests, please try again later.",
      retryAfterSeconds: Math.ceil(cfg.global.windowMs / 1000),
    },
  });

  const authLimiter = rateLimit({
    windowMs: cfg.auth.windowMs,
    max: cfg.auth.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many authentication attempts, try again later.",
      retryAfterSeconds: Math.ceil(cfg.auth.windowMs / 1000),
    },
  });

  const authSlowdown = slowDown({
  windowMs: cfg.slowdown.windowMs,
  delayAfter: cfg.slowdown.delayAfter,
  delayMs: () => cfg.slowdown.delayMs,
});


  return { globalLimiter, authLimiter, authSlowdown };
}

module.exports = { createRateLimiters };
