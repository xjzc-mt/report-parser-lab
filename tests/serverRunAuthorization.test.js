import test from 'node:test';
import assert from 'node:assert/strict';

import { createRunAuthorizationStore } from '../server/runAuthorization.js';

test('运行授权可校验页面并拒绝错配页面', () => {
  const store = createRunAuthorizationStore({ now: () => 1000, ttlMs: 60_000 });
  const { runId, expiresAt } = store.authorize('prompt-iteration');

  assert.equal(typeof runId, 'string');
  assert.equal(expiresAt, 61_000);
  assert.equal(store.validate(runId, 'prompt-iteration'), true);
  assert.equal(store.validate(runId, 'online-validation'), false);
  assert.equal(store.validate('missing', 'prompt-iteration'), false);
});

test('运行授权到期后失效', () => {
  let current = 0;
  const store = createRunAuthorizationStore({ now: () => current, ttlMs: 60_000 });
  const { runId } = store.authorize('online-validation');

  current = 60_001;
  assert.equal(store.validate(runId, 'online-validation'), false);
  assert.equal(store.size(), 0);
});

test('运行授权数量超过上限时清理最早到期的记录', () => {
  let current = 0;
  const store = createRunAuthorizationStore({ now: () => current, ttlMs: 60_000 });
  const ids = [];
  for (let index = 0; index < 2005; index += 1) {
    current += 1;
    ids.push(store.authorize('prompt-iteration').runId);
  }
  store.cleanup();
  assert.equal(store.size() <= 2000, true);
  assert.equal(store.validate(ids[0], 'prompt-iteration'), false);
  assert.equal(store.validate(ids[ids.length - 1], 'prompt-iteration'), true);
});
