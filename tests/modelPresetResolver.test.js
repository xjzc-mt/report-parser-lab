import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPresetCapabilityError,
  resolvePagePreset,
  resolveRuntimeLlmConfig
} from '../src/services/modelPresetResolver.js';

test('resolveRuntimeLlmConfig 可将 Gemini 预设转成当前 service 可消费的 runtime config', () => {
  const runtimeConfig = resolveRuntimeLlmConfig({
    id: 'preset_gemini_default',
    name: '默认 Gemini',
    transportType: 'gemini_native',
    vendorKey: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelName: 'gemini-2.5-pro',
    credentialMode: 'manual',
    manualApiKey: 'k',
    capabilities: {
      supportsPdfUpload: true,
      supportsJsonMode: true
    }
  });

  assert.equal(runtimeConfig.providerType, 'gemini');
  assert.equal(runtimeConfig.apiUrl, 'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(runtimeConfig.apiKey, 'k');
  assert.equal(runtimeConfig.modelName, 'gemini-2.5-pro');
  assert.equal(runtimeConfig.presetId, 'preset_gemini_default');
});

test('resolveRuntimeLlmConfig 会保留 DeepSeek 高级请求参数', () => {
  const runtimeConfig = resolveRuntimeLlmConfig({
    id: 'preset_deepseek_default',
    name: '默认 DeepSeek',
    transportType: 'openai_compatible',
    vendorKey: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-v4-pro',
    credentialMode: 'env',
    credentialRef: 'VITE_DEFAULT_DEEPSEEK_API_KEY',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true
    },
    requestOptions: {
      max_tokens: 8192,
      reasoning: { enabled: true }
    }
  }, {
    VITE_DEFAULT_DEEPSEEK_API_KEY: 'deepseek-key'
  });

  assert.equal(runtimeConfig.providerType, 'deepseek');
  assert.equal(runtimeConfig.apiKey, 'deepseek-key');
  assert.deepEqual(runtimeConfig.requestOptions, {
    max_tokens: 8192,
    reasoning: { enabled: true }
  });
});

test('getPresetCapabilityError 会在页面能力不满足时返回明确原因', () => {
  const error = getPresetCapabilityError(
    {
      capabilities: {
        supportsPdfUpload: false,
        supportsJsonMode: true
      }
    },
    {
      supportsPdfUpload: true
    }
  );

  assert.match(error, /PDF 直传/);
});

test('resolvePagePreset 优先命中页面选择，其次回退默认预设', () => {
  const presets = [
    { id: 'preset_default', isDefault: true },
    { id: 'preset_secondary', isDefault: false }
  ];

  assert.equal(resolvePagePreset('prompt-iteration', presets, {
    'prompt-iteration': 'preset_secondary'
  }, 'preset_default')?.id, 'preset_secondary');
  assert.equal(resolvePagePreset('prompt-iteration', presets, {}, 'preset_default')?.id, 'preset_default');
});

test('resolvePagePreset 在页面未单独设置时优先使用全局默认选择', () => {
  const presets = [
    { id: 'preset_gemini_default', isDefault: true },
    { id: 'preset_openai_default', isDefault: false }
  ];

  assert.equal(
    resolvePagePreset('prompt-iteration', presets, {}, 'preset_openai_default')?.id,
    'preset_openai_default'
  );
});
