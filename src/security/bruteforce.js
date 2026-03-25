const LOCK_AFTER   = 5;
const LOCK_MINUTES = 15;

// In-memory fallback (single-process only)
const memStore = new Map();

function keyFor(ip, username = "") {
  return `bf::${ip || "unknown"}::${(username || "").toLowerCase()}`;
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

async function redisGet(client, key) {
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function redisSet(client, key, value, ttlMs) {
  try {
    await client.set(key, JSON.stringify(value), "PX", ttlMs);
  } catch { /* ignore */ }
}

async function redisDel(client, key) {
  try { await client.del(key); } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function recordFailure(ip, username, redisClient = null) {
  const key = keyFor(ip, username);

  if (redisClient) {
    const rec = (await redisGet(redisClient, key)) ?? { count: 0, until: 0 };
    rec.count += 1;
    if (rec.count >= LOCK_AFTER) rec.until = Date.now() + LOCK_MINUTES * 60 * 1000;
    const ttl = rec.until ? rec.until - Date.now() + 1000 : LOCK_MINUTES * 60 * 1000;
    await redisSet(redisClient, key, rec, ttl);
  } else {
    const rec = memStore.get(key) ?? { count: 0, until: 0 };
    rec.count += 1;
    if (rec.count >= LOCK_AFTER) rec.until = Date.now() + LOCK_MINUTES * 60 * 1000;
    memStore.set(key, rec);
  }
}

async function resetFailures(ip, username, redisClient = null) {
  const key = keyFor(ip, username);
  if (redisClient) await redisDel(redisClient, key);
  else memStore.delete(key);
}

async function isLocked(ip, username, redisClient = null) {
  const key = keyFor(ip, username);
  let rec;
  if (redisClient) rec = await redisGet(redisClient, key);
  else rec = memStore.get(key);
  if (!rec?.until) return false;
  if (Date.now() > rec.until) {
    if (redisClient) await redisDel(redisClient, key);
    else memStore.delete(key);
    return false;
  }
  return true;
}

async function lockRemainingMs(ip, username, redisClient = null) {
  const key = keyFor(ip, username);
  let rec;
  if (redisClient) rec = await redisGet(redisClient, key);
  else rec = memStore.get(key);
  return rec?.until ? Math.max(0, rec.until - Date.now()) : 0;
}

module.exports = {
  recordFailure,
  resetFailures,
  isLocked,
  lockRemainingMs,
  LOCK_AFTER,
  LOCK_MINUTES,
};