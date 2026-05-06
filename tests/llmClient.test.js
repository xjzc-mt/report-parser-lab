import test from 'node:test';
import assert from 'node:assert/strict';

import { callLLM } from '../src/services/llmClient.js';

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
