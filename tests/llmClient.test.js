import test from 'node:test';
import assert from 'node:assert/strict';

import { callLLM, callLLMWithRetry, getModelPricing, isPricingConfigured } from '../src/services/llmClient.js';

test('callLLM 会把 DeepSeek/OpenAI-compatible 高级请求参数合并进 chat completions 请求体', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options) => {
    requests.push({
      url,
      body: JSON.parse(options.body),
      headers: options.headers
    });

    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 11, completion_tokens: 7 }
        };
      }
    };
  };

  try {
    const result = await callLLM({
      sysPrompt: 'system',
      userPrompt: 'user',
      apiUrl: 'https://api.deepseek.com',
      apiKey: 'deepseek-key',
      modelName: 'deepseek-v4-pro',
      providerType: 'deepseek',
      requestOptions: {
        max_tokens: 8192,
        reasoning: { enabled: true },
        extra_body: { custom_flag: 'x' }
      }
    });

    assert.equal(result.text, '{"ok":true}');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.deepseek.com/chat/completions');
    assert.equal(requests[0].headers.Authorization, 'Bearer deepseek-key');
    assert.equal(requests[0].body.model, 'deepseek-v4-pro');
    assert.deepEqual(requests[0].body.messages, [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' }
    ]);
    assert.equal(requests[0].body.max_tokens, 8192);
    assert.deepEqual(requests[0].body.reasoning, { enabled: true });
    assert.equal(requests[0].body.custom_flag, 'x');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAI 兼容个人预设声明 PDF 能力后会以 file 内容发送', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        };
      }
    };
  };

  try {
    await callLLM({
      sysPrompt: 'system',
      userPrompt: 'user',
      apiUrl: 'https://one-api.example.com/v1',
      apiKey: 'k',
      modelName: 'deepseek-v4.1',
      providerType: 'openai',
      supportsPdfUpload: true,
      pdfBase64: 'PDF_BASE64'
    });

    const content = requests[0].body.messages[1].content;
    assert.equal(content[1].type, 'file');
    assert.match(content[1].file.file_data, /PDF_BASE64/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getModelPricing 使用最长匹配，避免 large 模型命中普通版本', () => {
  assert.equal(getModelPricing('gemini-2.5-pro-large')?.key, 'gemini-2.5-pro-large');
  assert.equal(getModelPricing('gemini-3-pro-preview-large')?.key, 'gemini-3-pro-preview-large');
  assert.equal(getModelPricing('qwen3.8-flash'), null);
  assert.equal(isPricingConfigured('qwen3.8-flash'), false);
});

test('价格表支持阶梯价和人民币折算', () => {
  const low = getModelPricing('qwen3.7-plus', 100_000);
  const high = getModelPricing('qwen3.7-plus', 300_000);
  assert.equal(low.key, 'qwen3.7-plus');
  assert.ok(Math.abs(low.input - 0.276 / 1_000_000) < 1e-12);
  assert.ok(Math.abs(high.input - 0.826 / 1_000_000) < 1e-12);

  const deepseek = getModelPricing('deepseek-v4-pro', 10_000);
  assert.ok(Math.abs(deepseek.input - (3 / 7.2) / 1_000_000) < 1e-12);

  const gemini = getModelPricing('gemini-3.1-pro', 300_000);
  assert.ok(Math.abs(gemini.input - 4 / 1_000_000) < 1e-12);
});


test('callLLMWithRetry 在重试等待中被取消后不再发起第二次请求', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ error: 'temporary' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const controller = new AbortController();
    const pending = callLLMWithRetry({
      sysPrompt: 'system',
      userPrompt: 'user',
      apiUrl: 'https://api.example.com/v1',
      apiKey: 'fake-key',
      modelName: 'model-a',
      providerType: 'openai'
    }, () => {}, 3, controller.signal);

    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, (error) => error?.name === 'AbortError');
    assert.equal(requestCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
