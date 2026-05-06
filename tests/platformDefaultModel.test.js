import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAllEnvDefaultPresets,
  resolvePlatformDefaultRuntimeConfig,
  resolveSettingsWithPlatformDefaults
} from '../src/utils/platformDefaultModel.js';

test('buildAllEnvDefaultPresets 优先生成平台默认预设，并支持通用 env 切换厂商', () => {
  const presets = buildAllEnvDefaultPresets({
    VITE_PLATFORM_DEFAULT_PRESET_NAME: '平台 OpenAI',
    VITE_PLATFORM_DEFAULT_VENDOR: 'openai',
    VITE_PLATFORM_DEFAULT_MODEL: 'gpt-4.1',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://api.openai.com/v1',
    VITE_PLATFORM_DEFAULT_API_KEY: 'platform-key',
    VITE_DEFAULT_GEMINI_API_KEY: 'gemini-key',
    VITE_DEFAULT_GEMINI_MODEL: 'gemini-2.5-pro'
  });

  assert.equal(presets.length, 2);
  assert.equal(presets[0].id, 'preset_platform_default');
  assert.equal(presets[0].name, '平台 OpenAI');
  assert.equal(presets[0].vendorKey, 'openai');
  assert.equal(presets[0].modelName, 'gpt-4.1');
  assert.equal(presets[0].credentialRef, 'VITE_PLATFORM_DEFAULT_API_KEY');
  assert.equal(presets[1].id, 'preset_gemini_default');
});

test('resolvePlatformDefaultRuntimeConfig 在只有旧 VITE_GEMINI_API_KEY 时仍回退到 Gemini 平台默认', () => {
  const runtimeConfig = resolvePlatformDefaultRuntimeConfig({
    VITE_GEMINI_API_KEY: 'legacy-gemini-key'
  });

  assert.equal(runtimeConfig?.providerType, 'gemini');
  assert.equal(runtimeConfig?.apiKey, 'legacy-gemini-key');
  assert.equal(runtimeConfig?.apiUrl, 'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(runtimeConfig?.modelName, 'gemini-2.5-pro');
});

test('resolveSettingsWithPlatformDefaults 只在字段缺失时回退平台默认配置', () => {
  const resolved = resolveSettingsWithPlatformDefaults({
    apiKey: '',
    apiUrl: '',
    modelName: '',
    providerType: ''
  }, {
    VITE_PLATFORM_DEFAULT_VENDOR: 'glm',
    VITE_PLATFORM_DEFAULT_MODEL: 'glm-4.5',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4',
    VITE_PLATFORM_DEFAULT_API_KEY: 'glm-key'
  });

  assert.equal(resolved.apiKey, 'glm-key');
  assert.equal(resolved.apiUrl, 'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(resolved.modelName, 'glm-4.5');
  assert.equal(resolved.providerType, 'glm');

  const manual = resolveSettingsWithPlatformDefaults({
    apiKey: 'manual-key',
    apiUrl: 'https://example.com/v1',
    modelName: 'custom-model',
    providerType: 'openai'
  }, {
    VITE_PLATFORM_DEFAULT_VENDOR: 'gemini',
    VITE_PLATFORM_DEFAULT_MODEL: 'gemini-2.5-pro',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    VITE_PLATFORM_DEFAULT_API_KEY: 'platform-key'
  });

  assert.equal(manual.apiKey, 'manual-key');
  assert.equal(manual.apiUrl, 'https://example.com/v1');
  assert.equal(manual.modelName, 'custom-model');
  assert.equal(manual.providerType, 'openai');
});

test('resolvePlatformDefaultRuntimeConfig 支持 DeepSeek 平台默认与高级请求参数', () => {
  const runtimeConfig = resolvePlatformDefaultRuntimeConfig({
    VITE_PLATFORM_DEFAULT_VENDOR: 'deepseek',
    VITE_PLATFORM_DEFAULT_MODEL: 'deepseek-v4-pro',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://api.deepseek.com',
    VITE_PLATFORM_DEFAULT_API_KEY: 'deepseek-key',
    VITE_PLATFORM_DEFAULT_REQUEST_OPTIONS: JSON.stringify({
      max_tokens: 8192,
      reasoning: { enabled: true }
    })
  });

  assert.equal(runtimeConfig?.providerType, 'deepseek');
  assert.equal(runtimeConfig?.apiKey, 'deepseek-key');
  assert.equal(runtimeConfig?.apiUrl, 'https://api.deepseek.com');
  assert.equal(runtimeConfig?.modelName, 'deepseek-v4-pro');
  assert.deepEqual(runtimeConfig?.requestOptions, {
    max_tokens: 8192,
    reasoning: { enabled: true }
  });
});

test('buildAllEnvDefaultPresets 支持 DeepSeek 厂商默认预设', () => {
  const presets = buildAllEnvDefaultPresets({
    VITE_DEFAULT_DEEPSEEK_API_KEY: 'deepseek-key',
    VITE_DEFAULT_DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    VITE_DEFAULT_DEEPSEEK_MODEL: 'deepseek-v4-flash',
    VITE_DEFAULT_DEEPSEEK_REQUEST_OPTIONS: '{"max_tokens":4096}'
  });

  assert.equal(presets.length, 1);
  assert.equal(presets[0].id, 'preset_deepseek_default');
  assert.equal(presets[0].vendorKey, 'deepseek');
  assert.equal(presets[0].transportType, 'openai_compatible');
  assert.equal(presets[0].modelName, 'deepseek-v4-flash');
  assert.deepEqual(presets[0].requestOptions, { max_tokens: 4096 });
});
