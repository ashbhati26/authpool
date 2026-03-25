const Redis = require("ioredis");

/**
 * Create a Redis client if configuration is provided.
 * Returns null if redis is not configured — all features degrade gracefully.
 *
 * @param {{ host?: string, port?: number, url?: string, enabled?: boolean }} opts
 * @returns {Promise<import('ioredis').Redis | null>}
 */
async function createRedisClient(opts = {}) {
  if (opts.enabled === false) {
    console.log("ℹ️  Redis disabled — brute-force store will use in-process memory (single instance only).");
    return null;
  }

  const url  = opts.url  || process.env.REDIS_URL;
  const host = opts.host || process.env.REDIS_HOST;
  const port = opts.port || process.env.REDIS_PORT;

  if (!url && !host) {
    console.log("ℹ️  No Redis config found — brute-force store will use in-process memory (single instance only).");
    return null;
  }

  try {
    const client = url
      ? new Redis(url, { lazyConnect: true })
      : new Redis({ host, port: Number(port) || 6379, lazyConnect: true });

    await client.connect();
    console.log("✅ Redis connected");
    return client;
  } catch (err) {
    console.warn("⚠️  Redis connection failed — falling back to in-memory store:", err.message);
    return null;
  }
}

module.exports = { createRedisClient };