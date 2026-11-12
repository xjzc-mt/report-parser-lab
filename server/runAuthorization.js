import { randomBytes } from 'node:crypto';

const DEFAULT_RUN_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_RUNS = 2000;

export function createRunAuthorizationStore({
  ttlMs = DEFAULT_RUN_TTL_MS,
  now = () => Date.now()
} = {}) {
  const runs = new Map();
  const normalizedTtlMs = Number.isFinite(Number(ttlMs)) && Number(ttlMs) >= 60_000
    ? Number(ttlMs)
    : DEFAULT_RUN_TTL_MS;

  function cleanup() {
    const current = now();
    for (const [runId, entry] of runs) {
      if (entry.expiresAt <= current) {
        runs.delete(runId);
      }
    }
    if (runs.size > MAX_RUNS) {
      const sorted = Array.from(runs.entries()).sort((left, right) => left[1].expiresAt - right[1].expiresAt);
      for (const [runId] of sorted.slice(0, runs.size - MAX_RUNS)) {
        runs.delete(runId);
      }
    }
  }

  return {
    authorize(pageKey) {
      cleanup();
      const runId = `run_${randomBytes(24).toString('base64url')}`;
      const expiresAt = now() + normalizedTtlMs;
      runs.set(runId, { pageKey, createdAt: now(), expiresAt });
      return { runId, expiresAt };
    },

    validate(runId, pageKey) {
      if (!runId || !pageKey) {
        return false;
      }
      const entry = runs.get(runId);
      if (!entry) {
        return false;
      }
      if (entry.expiresAt <= now()) {
        runs.delete(runId);
        return false;
      }
      return entry.pageKey === pageKey;
    },

    cleanup,

    size() {
      return runs.size;
    },

    ttlMs: normalizedTtlMs
  };
}
