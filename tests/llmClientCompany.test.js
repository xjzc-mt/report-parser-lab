import test from 'node:test';
import assert from 'node:assert/strict';

import { callLLM, usesPdfDirectInput } from '../src/services/llmClient.js';

function createCompanyParams(overrides = {}) {
  return {
    sysPrompt: 'system',
    userPrompt: 'user',
    apiUrl: '',
    apiKey: '',
    modelName: 'model-a',
    providerType: 'company',
    serverManaged: true,
    companyConnectionId: 'conn_1',
    pageKey: 'prompt-iteration',
    runId: 'run_test',
    supportsPdfUpload: true,
    ...overrides
  };
}

test('usesPdfDirectInput 支持 Gemini 与声明 PDF 能力的公司连接', () => {
  assert.equal(usesPdfDirectInput({ providerType: 'gemini' }), true);
  assert.equal(usesPdfDirectInput({ providerType: 'openai', apiUrl: 'https://api.example/v1' }), false);
  assert.equal(usesPdfDirectInput({ providerType: 'openai', supportsPdfUpload: true }), true);
  assert.equal(usesPdfDirectInput({
    providerType: 'company',
    serverManaged: true,
    supportsPdfUpload: true
  }), true);
  assert.equal(usesPdfDirectInput({
    providerType: 'company',
    serverManaged: true,
    supportsPdfUpload: false
  }), false);
});

test('公司预设通过 /api/llm/company 转发，不携带本地 Key', async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      text: '{"ok":true}',
      usage: { input_tokens: 12, output_tokens: 4 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await callLLM(createCompanyParams({ pdfBase64: 'PDF_BASE64' }));
    assert.equal(result.text, '{"ok":true}');
    assert.deepEqual(result.usage, { input_tokens: 12, output_tokens: 4 });
    assert.equal(captured.url, '/api/llm/company');
    assert.equal(captured.init.credentials, 'same-origin');
    assert.equal(captured.init.headers['X-LLM-Lab-Client'], 'web');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.connectionId, 'conn_1');
    assert.equal(body.model, 'model-a');
    assert.equal(body.pageKey, 'prompt-iteration');
    assert.equal(body.runId, 'run_test');
    assert.equal(body.pdfBase64, 'PDF_BASE64');
    assert.equal('apiKey' in body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('公司转发缺少 runId 时在客户端直接拒绝', async () => {
  await assert.rejects(
    () => callLLM(createCompanyParams({ runId: '' })),
    /运行授权缺失/
  );
});

test('公司转发错误会透出服务端脱敏消息', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'UPSTREAM_ERROR', message: '上游模型服务返回 500。' }
  }), { status: 502, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      () => callLLM(createCompanyParams()),
      /公司模型服务错误：上游模型服务返回 500。/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('个人预设仍直连厂商地址，不会误走公司代理', async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 2, completion_tokens: 1 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await callLLM({
      sysPrompt: 'system',
      userPrompt: 'user',
      apiUrl: 'https://api.example.com/v1',
      apiKey: 'personal-key',
      modelName: 'model-a',
      providerType: 'openai',
      serverManaged: false
    });
    assert.equal(captured.url, 'https://api.example.com/v1/chat/completions');
    assert.equal(captured.init.headers.Authorization, 'Bearer personal-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
