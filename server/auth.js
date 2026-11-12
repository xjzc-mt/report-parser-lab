import { createHash, randomBytes } from 'node:crypto';

import { verifyPassword } from './password.js';

export const SESSION_COOKIE = 'llm_lab_admin';
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_SESSIONS = 20;

function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function parseCookies(header) {
  const result = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    const value = part.slice(index + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch (_) {
      result[key] = value;
    }
  }
  return result;
}

export function buildSessionCookie(token, { secure = false, maxAgeSec = DEFAULT_SESSION_TTL_MS / 1000 } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookie({ secure = false } = {}) {
  return buildSessionCookie('', { secure, maxAgeSec: 0 });
}

export function createAuthService({
  configStore,
  env = process.env,
  now = () => Date.now(),
  sessionTtlMs = DEFAULT_SESSION_TTL_MS
} = {}) {
  const sessions = new Map();
  const secureCookie = String(env.COOKIE_SECURE || '').toLowerCase() === 'true';

  function cleanup() {
    const current = now();
    for (const [key, session] of sessions) {
      if (session.expiresAt <= current) {
        sessions.delete(key);
      }
    }
  }

  function createSession(username) {
    cleanup();
    if (sessions.size >= MAX_SESSIONS) {
      let oldestKey = '';
      let oldestSeen = Infinity;
      for (const [key, session] of sessions) {
        if (session.lastSeenAt < oldestSeen) {
          oldestSeen = session.lastSeenAt;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        sessions.delete(oldestKey);
      }
    }

    const token = randomBytes(32).toString('base64url');
    const current = now();
    sessions.set(hashToken(token), {
      username,
      createdAt: current,
      lastSeenAt: current,
      expiresAt: current + sessionTtlMs
    });
    return token;
  }

  return {
    secureCookie,
    sessionTtlMs,

    verifyCredentials(username, password) {
      const admin = configStore.get().admin;
      if (!admin) {
        return false;
      }
      if (String(username || '').trim() !== admin.username) {
        return false;
      }
      return verifyPassword(password, admin.passwordHash);
    },

    createSession,

    getSession(token) {
      if (!token) return null;
      const key = hashToken(token);
      const session = sessions.get(key);
      if (!session) return null;
      const current = now();
      if (session.expiresAt <= current) {
        sessions.delete(key);
        return null;
      }
      session.lastSeenAt = current;
      session.expiresAt = current + sessionTtlMs;
      return { username: session.username, expiresAt: session.expiresAt };
    },

    destroySession(token) {
      if (!token) return;
      sessions.delete(hashToken(token));
    },

    getSessionFromRequest(req) {
      const cookies = parseCookies(req.headers.cookie);
      return this.getSession(cookies[SESSION_COOKIE]);
    },

    buildCookie(token) {
      return buildSessionCookie(token, {
        secure: secureCookie,
        maxAgeSec: Math.floor(sessionTtlMs / 1000)
      });
    },

    buildClearCookie() {
      return buildClearSessionCookie({ secure: secureCookie });
    },

    cleanup,

    size() {
      return sessions.size;
    }
  };
}
