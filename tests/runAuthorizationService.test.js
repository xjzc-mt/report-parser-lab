import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeCompanyRun,
  needsCompanyRunAuthorization
} from '../src/services/runAuthorizationService.js';

test('needsCompanyRunAuthorization 仅公司托管配置需要授权', () => {
  assert.equal(needsCompanyRunAuthorization({ serverManaged: true }), true);
  assert.equal(needsCompanyRunAuthorization({ serverManaged: false }), false);
  assert.equal(needsCompanyRunAuthorization(null), false);
});

test('authorizeCompanyRun 发送页面标识并返回 runId', async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ runId: 'run_123', expiresAt: 123 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const runId = await authorizeCompanyRun('prompt-iteration');
    assert.equal(runId, 'run_123');
    assert.equal(captured.url, '/api/runs/authorize');
    assert.equal(captured.init.credentials, 'same-origin');
    assert.equal(captured.init.headers['X-LLM-Lab-Client'], 'web');
    assert.deepEqual(JSON.parse(captured.init.body), { pageKey: 'prompt-iteration' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authorizeCompanyRun 把页面关闭错误透出给调用方', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'PAGE_CLOSED', message: '该页面已在后台关闭，不能启动新任务。' }
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' }
  });

  try {
    await assert.rejects(
      () => authorizeCompanyRun('online-validation'),
      (error) => error.message.includes('后台关闭') && error.code === 'PAGE_CLOSED'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
