export function createLoginRateLimiter({
  maxFailures = 5,
  windowMs = 10 * 60 * 1000,
  blockMs = 10 * 60 * 1000,
  now = () => Date.now()
} = {}) {
  const entries = new Map();

  function getEntry(key) {
    const existing = entries.get(key);
    if (!existing) {
      const fresh = { failures: 0, firstFailureAt: null, blockedUntil: 0 };
      entries.set(key, fresh);
      return fresh;
    }
    return existing;
  }

  return {
    check(key) {
      const entry = getEntry(key);
      const current = now();
      if (entry.blockedUntil > current) {
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil((entry.blockedUntil - current) / 1000))
        };
      }
      if (entry.firstFailureAt !== null && current - entry.firstFailureAt > windowMs) {
        entry.failures = 0;
        entry.firstFailureAt = null;
      }
      return { allowed: true, retryAfterSec: 0 };
    },

    fail(key) {
      const entry = getEntry(key);
      const current = now();
      if (entry.firstFailureAt === null || current - entry.firstFailureAt > windowMs) {
        entry.failures = 0;
        entry.firstFailureAt = current;
      }
      entry.failures += 1;
      if (entry.failures >= maxFailures) {
        entry.blockedUntil = current + blockMs;
      }
    },

    reset(key) {
      entries.delete(key);
    },

    cleanup() {
      const current = now();
      for (const [key, entry] of entries) {
        if (entry.blockedUntil <= current && (entry.firstFailureAt === null || current - entry.firstFailureAt > windowMs)) {
          entries.delete(key);
        }
      }
    },

    size() {
      return entries.size;
    }
  };
}

export function createRequestRateLimiter({
  limit = 600,
  windowMs = 60 * 1000,
  now = () => Date.now()
} = {}) {
  const entries = new Map();

  return {
    check(key) {
      const current = now();
      const entry = entries.get(key);
      if (!entry || current - entry.startedAt >= windowMs) {
        entries.set(key, { startedAt: current, count: 1 });
        return { allowed: true, retryAfterSec: 0 };
      }
      if (entry.count >= limit) {
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil((entry.startedAt + windowMs - current) / 1000))
        };
      }
      entry.count += 1;
      return { allowed: true, retryAfterSec: 0 };
    },

    cleanup() {
      const current = now();
      for (const [key, entry] of entries) {
        if (current - entry.startedAt >= windowMs) {
          entries.delete(key);
        }
      }
    },

    size() {
      return entries.size;
    }
  };
}
