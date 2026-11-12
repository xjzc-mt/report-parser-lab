import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractModelIds,
  probePersonalModels
} from '../src/services/personalModelProbeService.js';

test('extractModelIds 兼容 OpenAI 和 Gemini 的模型列表结构', () => {
  assert.deepEqual(
    extractModelIds({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }] }),
    ['model-a', 'model-b']
  );
  assert.deepEqual(
    extractModelIds({ models: [{ name: 'models/gemini-2.5-pro' }, { name: 'models/gemini-2.5-flash' }] }),
    ['gemini-2.5-flash', 'gemini-2.5-pro']
  );
});

test('probePersonalModels 使用浏览器直连并返回模型列表', async () => {
  const calls = [];
  const models = await probePersonalModels({
    baseUrl: 'https://one-api.example.com/v1/',
    apiKey: 'personal-key',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: [{ id: 'mio-model-b' }, { id: 'mio-model-a' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  assert.deepEqual(models, ['mio-model-a', 'mio-model-b']);
  assert.equal(calls[0].url, 'https://one-api.example.com/v1/models');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer personal-key');
});

test('probePersonalModels 对 Anthropic 和不完整配置给出明确提示', async () => {
  await assert.rejects(
    () => probePersonalModels({ baseUrl: 'https://api.anthropic.com', apiKey: 'k', transportType: 'anthropic_native' }),
    /不支持 Ping/
  );
  await assert.rejects(
    () => probePersonalModels({ baseUrl: '', apiKey: '' }),
    /接口地址/
  );
});
