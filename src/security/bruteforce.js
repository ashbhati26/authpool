const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

const failures = new Map();

function keyFor(ip, username = "") {
  return `${ip || "unknown"}::${(username || "").toLowerCase()}`;
}

function recordFailure(ip, username) {
  const key = keyFor(ip, username);
  const rec = failures.get(key) ?? { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= LOCK_AFTER) {
    rec.until = Date.now() + LOCK_MINUTES * 60 * 1000;
  }
  failures.set(key, rec);
}

function resetFailures(ip, username) {
  failures.delete(keyFor(ip, username));
}

function isLocked(ip, username) {
  const rec = failures.get(keyFor(ip, username));
  if (!rec) return false;
  if (!rec.until) return false;
  if (Date.now() > rec.until) {
    failures.delete(keyFor(ip, username));
    return false;
  }
  return true;
}

function lockRemainingMs(ip, username) {
  const rec = failures.get(keyFor(ip, username));
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
