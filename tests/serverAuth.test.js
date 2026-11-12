import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClearSessionCookie,
  buildSessionCookie,
  createAuthService,
  parseCookies,
  SESSION_COOKIE
} from '../server/auth.js';
import { hashPassword } from '../server/password.js';
import { createLoginRateLimiter, createRequestRateLimiter } from '../server/rateLimit.js';

function createConfigStore(password = 'correct-password') {
  const admin = {
    username: 'admin',
    passwordHash: hashPassword(password)
  };
  return {
    get() {
      return { admin };
    }
  };
}

test('管理员凭据校验使用 scrypt 哈希', () => {
  const auth = createAuthService({ configStore: createConfigStore(), env: {} });

  assert.equal(auth.verifyCredentials('admin', 'correct-password'), true);
  assert.equal(auth.verifyCredentials('admin', 'wrong-password'), false);
  assert.equal(auth.verifyCredentials('other', 'correct-password'), false);
});

test('会话创建、读取、续期和销毁', () => {
  let current = 1000;
  const auth = createAuthService({
    configStore: createConfigStore(),
    env: {},
    now: () => current,
    sessionTtlMs: 10_000
  });

  const token = auth.createSession('admin');
  assert.equal(typeof token, 'string');
  assert.equal(token.length >= 40, true);

  const session = auth.getSession(token);
  assert.equal(session.username, 'admin');
  assert.equal(session.expiresAt, 11_000);

  current = 9000;
  assert.equal(auth.getSession(token).expiresAt, 19_000);
  assert.equal(auth.getSession('invalid-token'), null);

  auth.destroySession(token);
  assert.equal(auth.getSession(token), null);
});

test('会话空闲超时后失效', () => {
  let current = 0;
  const auth = createAuthService({
    configStore: createConfigStore(),
    env: {},
    now: () => current,
    sessionTtlMs: 1000
  });

  const token = auth.createSession('admin');
  current = 1001;
  assert.equal(auth.getSession(token), null);
});

test('Cookie 属性包含 HttpOnly、SameSite=Strict，并可按 HTTPS 加 Secure', () => {
  const localCookie = buildSessionCookie('token-value', { secure: false, maxAgeSec: 60 });
  assert.match(localCookie, new RegExp(`^${SESSION_COOKIE}=token-value`));
  assert.match(localCookie, /HttpOnly/);
  assert.match(localCookie, /SameSite=Strict/);
  assert.match(localCookie, /Max-Age=60/);
  assert.equal(localCookie.includes('Secure'), false);

  const secureCookie = buildSessionCookie('token-value', { secure: true, maxAgeSec: 60 });
  assert.match(secureCookie, /Secure/);

  const clearCookie = buildClearSessionCookie({ secure: false });
  assert.match(clearCookie, /Max-Age=0/);
});

test('Cookie 解析支持编码值', () => {
  const cookies = parseCookies('a=1; llm_lab_admin=abc%2Fdef; empty=');
  assert.equal(cookies.a, '1');
  assert.equal(cookies.llm_lab_admin, 'abc/def');
  assert.equal(cookies.empty, '');
});

test('登录失败限速达到阈值后阻止继续尝试', () => {
  let current = 0;
  const limiter = createLoginRateLimiter({
    maxFailures: 3,
    windowMs: 1000,
    blockMs: 5000,
    now: () => current
  });

  assert.equal(limiter.check('ip').allowed, true);
  limiter.fail('ip');
  limiter.fail('ip');
  limiter.fail('ip');
  assert.equal(limiter.check('ip').allowed, false);
  assert.equal(limiter.check('ip').retryAfterSec, 5);

  current = 6000;
  assert.equal(limiter.check('ip').allowed, true);
});

test('请求限速按窗口计数', () => {
  let current = 0;
  const limiter = createRequestRateLimiter({ limit: 2, windowMs: 1000, now: () => current });

  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, false);
  current = 1001;
  assert.equal(limiter.check('ip').allowed, true);
});
