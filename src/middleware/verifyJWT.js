const jwt  = require("jsonwebtoken");
const User = require("../models/User");

const CACHE_TTL_MS = 30_000; // 30 second in-process fallback cache

// In-process cache used when Redis is not available
const localCache = new Map();

function localGet(key) {
  const entry = localCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { localCache.delete(key); return null; }
  return entry.value;
}

function localSet(key, value) {
  localCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * @param {string} JWT_SECRET
 * @param {{ redisClient?: import('ioredis').Redis|null }} [opts]
 */
const verifyJWT = (JWT_SECRET, { redisClient } = {}) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const cacheKey = `user:${decoded.id}:${decoded.tokenVersion}`;

      // 1. Try Redis cache
      let user = null;
      if (redisClient) {
        try {
          const raw = await redisClient.get(cacheKey);
          if (raw) user = JSON.parse(raw);
        } catch (_) { /* ignore */ }
      }

      // 2. Try local cache
      if (!user) user = localGet(cacheKey);

      // 3. DB fetch (cache miss)
      if (!user) {
        const dbUser = await User.findById(decoded.id).lean();
        if (!dbUser) return res.status(401).json({ error: "User not found" });
        if (dbUser.tokenVersion !== decoded.tokenVersion) {
          return res.status(401).json({ error: "Token has been invalidated" });
        }
        user = { id: String(dbUser._id), tokenVersion: dbUser.tokenVersion, roles: dbUser.roles };

        // Populate caches
        if (redisClient) {
          try { await redisClient.set(cacheKey, JSON.stringify(user), "PX", 30_000); } catch (_) { /* ignore */ }
        } else {
          localSet(cacheKey, user);
        }
      }

      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Token is invalid or expired" });
    }
  };
};

module.exports = verifyJWT;