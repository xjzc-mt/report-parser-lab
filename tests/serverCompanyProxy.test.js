import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompanyProxy } from '../server/companyProxy.js';
import { HttpError } from '../server/errors.js';

function createConnection(overrides = {}) {
  return {
    id: 'conn_1',
    name: '公司 OneAPI',
    transportType: 'openai_compatible',
    vendorKey: 'oneapi',
    baseUrl: 'https://upstream.example/v1',
    apiKey: 'fake-company-key',
    enabled: true,
    requestOptions: {},
    models: [
      {
        name: 'model-a',
        enabled: true,
        maxTokens: 8192,
        capabilities: {
          supportsPdfUpload: false,
          supportsJsonMode: true,
          supportsVision: false,
          supportsStreaming: true
        },
        requestOptions: {}
      }
    ],
    ...overrides
  };
}

function createProxy(connection = createConnection(), options = {}) {
  const calls = [];
  const logs = [];
  const fetchImpl = options.fetchImpl || (async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const proxy = createCompanyProxy({
    configStore: {
      getConnectionWithSecret(id) {
        return id === connection.id ? connection : null;
      }
    },
    env: { LOG_UPSTREAM_ERRORS: 'false', ...(options.env || {}) },
    fetchImpl,
    logger: {
      info(event, payload) { logs.push({ level: 'info', event, payload }); },
      warn(event, payload) { logs.push({ level: 'warn', event, payload }); },
      error(event, payload) { logs.push({ level: 'error', event, payload }); }
    },
    timeoutMs: options.timeoutMs,
    now: options.now
  });
  return { proxy, calls, logs };
}

const basePayload = {
  connectionId: 'conn_1',
  model: 'model-a',
  pageKey: 'prompt-iteration',
  systemPrompt: 'system prompt',
  userPrompt: 'user prompt'
};

test('OpenAI 兼容连接使用服务端地址和 Key 转发，并返回统一结构', async () => {
  const { proxy, calls } = createProxy();
  const result = await proxy.handle(basePayload);

  assert.equal(result.text, '{"ok":true}');
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 5 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://upstream.example/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-company-key');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'model-a');
  assert.equal(body.messages[1].content, 'user prompt');
  assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('OpenAI 兼容连接开启 PDF 能力后以 file 内容发送', async () => {
  const connection = createConnection({
    models: [{
      name: 'deepseek-v4.1',
      enabled: true,
      maxTokens: 8192,
      capabilities: {
        supportsPdfUpload: true,
        supportsJsonMode: true,
        supportsVision: true,
        supportsStreaming: true
      },
      requestOptions: {}
    }]
  });
  const { proxy, calls } = createProxy(connection);
  await proxy.handle({ ...basePayload, model: 'deepseek-v4.1', pdfBase64: 'PDF_BASE64' });

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.messages[1].content[0].type, 'text');
  assert.equal(body.messages[1].content[1].type, 'file');
  assert.equal(body.messages[1].content[1].file.filename, 'document.pdf');
  assert.match(body.messages[1].content[1].file.file_data, /^data:application\/pdf;base64,PDF_BASE64$/);
});

test('Gemini 原生连接使用 PDF inline_data 和 x-goog-api-key', async () => {
  const connection = createConnection({
    transportType: 'gemini_native',
    vendorKey: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [{
      name: 'gemini-2.5-pro',
      enabled: true,
      maxTokens: 8192,
      capabilities: {
        supportsPdfUpload: true,
        supportsJsonMode: true,
        supportsVision: true,
        supportsStreaming: false
      },
      requestOptions: {}
    }]
  });
  const { proxy, calls } = createProxy(connection, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 7 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });

  const result = await proxy.handle({
    ...basePayload,
    model: 'gemini-2.5-pro',
    pdfBase64: 'PDF_BASE64'
  });

  assert.equal(result.usage.input_tokens, 20);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent');
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'fake-company-key');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.contents[0].parts[0].inline_data.mime_type, 'application/pdf');
  assert.equal(body.contents[0].parts[0].inline_data.data, 'PDF_BASE64');
});

test('Anthropic 原生连接使用 x-api-key 和 v1/messages', async () => {
  const connection = createConnection({
    transportType: 'anthropic_native',
    vendorKey: 'claude',
    baseUrl: 'https://api.anthropic.com',
    models: [{
      name: 'claude-sonnet-4-6',
      enabled: true,
      maxTokens: 4096,
      capabilities: {
        supportsPdfUpload: false,
        supportsJsonMode: true,
        supportsVision: false,
        supportsStreaming: false
      },
      requestOptions: {}
    }]
  });
  const { proxy, calls } = createProxy(connection, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '{"ok":true}' }],
        usage: { input_tokens: 3, output_tokens: 2 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });

  await proxy.handle({ ...basePayload, model: 'claude-sonnet-4-6' });

  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].init.headers['x-api-key'], 'fake-company-key');
  assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(JSON.parse(calls[0].init.body).max_tokens, 4096);
});

test('转发层拒绝非法连接、未允许模型和禁用状态', async () => {
  const { proxy } = createProxy();

  await assert.rejects(
    () => proxy.handle({ ...basePayload, connectionId: 'missing' }),
    (error) => error instanceof HttpError && error.code === 'CONNECTION_NOT_FOUND'
  );
  await assert.rejects(
    () => proxy.handle({ ...basePayload, model: 'not-allowed' }),
    (error) => error instanceof HttpError && error.code === 'MODEL_NOT_ALLOWED'
  );

  const disabled = createProxy(createConnection({ enabled: false }));
  await assert.rejects(
    () => disabled.proxy.handle(basePayload),
    (error) => error instanceof HttpError && error.code === 'CONNECTION_DISABLED'
  );

  const noKey = createProxy(createConnection({ apiKey: '' }));
  await assert.rejects(
    () => noKey.proxy.handle(basePayload),
    (error) => error instanceof HttpError && error.code === 'CONNECTION_KEY_MISSING'
  );
});

test('转发层拒绝请求体注入目标地址和 Key', async () => {
  const { proxy, calls } = createProxy();

  await assert.rejects(
    () => proxy.handle({ ...basePayload, apiUrl: 'https://evil.example' }),
    (error) => error instanceof HttpError && error.code === 'FORBIDDEN_PAYLOAD_FIELD'
  );
  await assert.rejects(
    () => proxy.handle({ ...basePayload, apiKey: 'evil-key' }),
    (error) => error instanceof HttpError && error.code === 'FORBIDDEN_PAYLOAD_FIELD'
  );
  await assert.rejects(
    () => proxy.handle({ ...basePayload, pageKey: 'unknown-page' }),
    (error) => error instanceof HttpError && error.code === 'INVALID_PAGE_KEY'
  );
  assert.equal(calls.length, 0);
});

test('未声明 PDF 能力的模型拒绝二进制输入', async () => {
  const { proxy, calls } = createProxy();

  await assert.rejects(
    () => proxy.handle({ ...basePayload, pdfBase64: 'PDF_BASE64' }),
    (error) => error instanceof HttpError && error.code === 'MODEL_NO_PDF'
  );
  assert.equal(calls.length, 0);
});

test('上游错误会脱敏并返回可理解提示，不泄露 Key', async () => {
  const { proxy, logs } = createProxy(createConnection(), {
    fetchImpl: async () => new Response(
      JSON.stringify({ error: 'bad key fake-company-key' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    ),
    env: { LOG_UPSTREAM_ERRORS: 'true' }
  });

  await assert.rejects(
    () => proxy.handle(basePayload),
    (error) => error instanceof HttpError
      && error.status === 502
      && error.code === 'UPSTREAM_ERROR'
      && !error.message.includes('fake-company-key')
  );
  assert.equal(JSON.stringify(logs).includes('fake-company-key'), false);
});

test('请求高级参数不能覆盖模型和消息，但可以合并厂商扩展字段', async () => {
  const connection = createConnection({
    requestOptions: {
      model: 'evil-model',
      messages: [{ role: 'user', content: 'evil' }],
      max_tokens: 4096,
      thinking: { type: 'enabled' }
    }
  });
  const { proxy, calls } = createProxy(connection);
  await proxy.handle(basePayload);

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'model-a');
  assert.equal(body.messages[1].content, 'user prompt');
  assert.equal(body.max_tokens, 4096);
  assert.deepEqual(body.thinking, { type: 'enabled' });
});

test('连接测试使用最小请求并返回模型与耗时', async () => {
  const { proxy } = createProxy();
  const result = await proxy.testConnection('conn_1', 'model-a');

  assert.equal(result.ok, true);
  assert.equal(result.model, 'model-a');
  assert.equal(result.textPreview, '{"ok":true}');
  assert.equal(typeof result.latencyMs, 'number');
});

test('Ping 模型使用服务端连接地址和 Key，返回排序后的模型列表', async () => {
  const calls = [];
  const { proxy } = createProxy(createConnection(), {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        object: 'list',
        data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });

  const result = await proxy.listModels('conn_1');
  assert.deepEqual(result.models, ['model-a', 'model-b']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://upstream.example/v1/models');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-company-key');
  assert.equal(JSON.stringify(result).includes('fake-company-key'), false);
});

test('Ping 模型拒绝非 OpenAI 兼容连接，并脱敏上游错误', async () => {
  const gemini = createProxy(createConnection({
    transportType: 'gemini_native',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
  }));
  await assert.rejects(
    () => gemini.proxy.listModels('conn_1'),
    (error) => error instanceof HttpError && error.code === 'MODELS_PROBE_UNSUPPORTED'
  );

  const failing = createProxy(createConnection(), {
    fetchImpl: async () => new Response(
      JSON.stringify({ error: 'bad key fake-company-key' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  });
  await assert.rejects(
    () => failing.proxy.listModels('conn_1'),
    (error) => error instanceof HttpError
      && error.code === 'UPSTREAM_MODELS_ERROR'
      && !error.message.includes('fake-company-key')
  );
});

test('后台最大输出在三种协议的正常请求中生效', async () => {
  const openAi = createProxy(createConnection({
    models: [{
      name: 'model-a', enabled: true, maxTokens: 1234,
      capabilities: { supportsPdfUpload: false, supportsJsonMode: true, supportsVision: false, supportsStreaming: true },
      requestOptions: {}
    }]
  }));
  await openAi.proxy.handle(basePayload);
  assert.equal(JSON.parse(openAi.calls[0].init.body).max_tokens, 1234);

  const geminiCalls = [];
  const gemini = createProxy(createConnection({
    transportType: 'gemini_native',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [{
      name: 'gemini-test', enabled: true, maxTokens: 1234,
      capabilities: { supportsPdfUpload: true, supportsJsonMode: true, supportsVision: true, supportsStreaming: false },
      requestOptions: {}
    }]
  }), {
    fetchImpl: async (url, init) => {
      geminiCalls.push({ url, init });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  await gemini.proxy.handle({ ...basePayload, model: 'gemini-test' });
  assert.equal(JSON.parse(geminiCalls[0].init.body).generationConfig.maxOutputTokens, 1234);

  const anthropicCalls = [];
  const anthropic = createProxy(createConnection({
    transportType: 'anthropic_native',
    baseUrl: 'https://api.anthropic.com',
    models: [{
      name: 'claude-test', enabled: true, maxTokens: 1234,
      capabilities: { supportsPdfUpload: false, supportsJsonMode: true, supportsVision: false, supportsStreaming: false },
      requestOptions: {}
    }]
  }), {
    fetchImpl: async (url, init) => {
      anthropicCalls.push({ url, init });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  await anthropic.proxy.handle({ ...basePayload, model: 'claude-test' });
  assert.equal(JSON.parse(anthropicCalls[0].init.body).max_tokens, 1234);
});
