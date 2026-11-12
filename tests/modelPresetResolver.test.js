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
  assert.equal(runtimeConfig.credentialsReady, true);
  assert.equal(runtimeConfig.serverManaged, false);
  assert.equal(runtimeConfig.modelName, 'gemini-2.5-pro');
  assert.equal(runtimeConfig.presetId, 'preset_gemini_default');
});

test('resolveRuntimeLlmConfig 保留个人预设高级请求参数，但不再从 env 解析 Key', () => {
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
  assert.equal(runtimeConfig.apiKey, '');
  assert.equal(runtimeConfig.credentialsReady, false);
  assert.deepEqual(runtimeConfig.requestOptions, {
    max_tokens: 8192,
    reasoning: { enabled: true }
  });
});

test('resolveRuntimeLlmConfig 将公司预设转换为服务端托管配置', () => {
  const runtimeConfig = resolveRuntimeLlmConfig({
    id: 'company:conn_1:model-a',
    name: '公司 OneAPI · model-a',
    transportType: 'company_proxy',
    vendorKey: 'oneapi',
    modelName: 'model-a',
    credentialMode: 'company',
    companyConnectionId: 'conn_1',
    companyConnectionName: '公司 OneAPI',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true
    },
    available: true,
    status: 'active'
  });

  assert.equal(runtimeConfig.providerType, 'company');
  assert.equal(runtimeConfig.apiKey, '');
  assert.equal(runtimeConfig.serverManaged, true);
  assert.equal(runtimeConfig.credentialsReady, true);
  assert.equal(runtimeConfig.companyConnectionId, 'conn_1');
  assert.equal(runtimeConfig.supportsPdfUpload, false);
});

test('getPresetCapabilityError 会在公司连接不可用时返回明确原因', () => {
  const error = getPresetCapabilityError({
    credentialMode: 'company',
    available: false,
    unavailableReason: '公司连接尚未配置 API Key',
    capabilities: { supportsJsonMode: true }
  }, { supportsJsonMode: true });

  assert.match(error, /尚未配置 API Key/);
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

test('resolvePagePreset 只命中显式页面选择', () => {
  const presets = [
    { id: 'preset_default', isDefault: true },
    { id: 'preset_secondary', isDefault: false }
  ];

  assert.equal(resolvePagePreset('prompt-iteration', presets, {
    'prompt-iteration': 'preset_secondary'
  }, 'preset_default')?.id, 'preset_secondary');
  assert.equal(resolvePagePreset('prompt-iteration', presets, {}, 'preset_default'), null);
});

test('resolvePagePreset 在页面未设置时返回 null，不再使用全局默认', () => {
  const presets = [
    { id: 'preset_gemini_default', isDefault: true },
    { id: 'preset_openai_default', isDefault: false }
  ];

  assert.equal(
    resolvePagePreset('prompt-iteration', presets, {}, 'preset_openai_default'),
    null
  );
});


test('resolvePagePreset 在显式选择失效时返回 null，不静默回退', () => {
  const presets = [{ id: 'preset_default', isDefault: true }];
  assert.equal(
    resolvePagePreset('prompt-iteration', presets, { 'prompt-iteration': 'company:missing:model-a' }, 'preset_default'),
    null
  );
});

test('resolvePagePreset 在全局默认失效时返回 null，不静默回退', () => {
  const presets = [{ id: 'preset_default', isDefault: true }];
  assert.equal(
    resolvePagePreset('prompt-iteration', presets, {}, 'company:missing:model-a'),
    null
  );
});
