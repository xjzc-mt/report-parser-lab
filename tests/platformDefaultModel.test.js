import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePlatformDefaultConnection,
  resolvePlatformDefaultRuntimeConfig,
  resolveSettingsWithPlatformDefaults
} from '../src/utils/platformDefaultModel.js';

test('resolvePlatformDefaultConnection 只解析非敏感默认值，不读取任何 API Key', () => {
  const connection = resolvePlatformDefaultConnection({
    VITE_PLATFORM_DEFAULT_PRESET_NAME: '平台 OpenAI',
    VITE_PLATFORM_DEFAULT_VENDOR: 'openai',
    VITE_PLATFORM_DEFAULT_MODEL: 'gpt-4.1',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://api.openai.com/v1',
    VITE_PLATFORM_DEFAULT_API_KEY: 'platform-key',
    VITE_GEMINI_API_KEY: 'legacy-gemini-key'
  });

  assert.equal(connection.vendorKey, 'openai');
  assert.equal(connection.modelName, 'gpt-4.1');
  assert.equal(connection.baseUrl, 'https://api.openai.com/v1');
  assert.equal(connection.providerType, 'openai');
  assert.equal('apiKey' in connection, false);
});

test('resolvePlatformDefaultRuntimeConfig 不再从环境变量注入 Key', () => {
  const runtimeConfig = resolvePlatformDefaultRuntimeConfig({
    VITE_PLATFORM_DEFAULT_VENDOR: 'deepseek',
    VITE_PLATFORM_DEFAULT_MODEL: 'deepseek-v4-pro',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://api.deepseek.com',
    VITE_PLATFORM_DEFAULT_API_KEY: 'deepseek-key',
    VITE_GEMINI_API_KEY: 'legacy-gemini-key',
    VITE_PLATFORM_DEFAULT_REQUEST_OPTIONS: JSON.stringify({
      max_tokens: 8192,
      reasoning: { enabled: true }
    })
  });

  assert.equal(runtimeConfig?.providerType, 'deepseek');
  assert.equal(runtimeConfig?.apiKey, '');
  assert.equal(runtimeConfig?.apiUrl, 'https://api.deepseek.com');
  assert.equal(runtimeConfig?.modelName, 'deepseek-v4-pro');
  assert.deepEqual(runtimeConfig?.requestOptions, {
    max_tokens: 8192,
    reasoning: { enabled: true }
  });
});

test('resolveSettingsWithPlatformDefaults 只补充非敏感默认值，不注入环境 Key', () => {
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

  assert.equal(resolved.apiKey, '');
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

test('resolveSettingsWithPlatformDefaults 对公司托管配置保留服务端字段且不回退环境 Key', () => {
  const resolved = resolveSettingsWithPlatformDefaults({
    apiKey: '',
    apiUrl: '',
    modelName: 'company-model',
    providerType: 'company',
    serverManaged: true,
    companyConnectionId: 'conn_1',
    supportsPdfUpload: true,
    pageKey: 'prompt-iteration',
    maxRetries: 2,
    requestOptions: { thinking: { type: 'enabled' } }
  }, {
    VITE_PLATFORM_DEFAULT_API_KEY: 'platform-key',
    VITE_PLATFORM_DEFAULT_MODEL: 'gemini-2.5-pro'
  });

  assert.equal(resolved.apiKey, '');
  assert.equal(resolved.providerType, 'company');
  assert.equal(resolved.serverManaged, true);
  assert.equal(resolved.companyConnectionId, 'conn_1');
  assert.equal(resolved.supportsPdfUpload, true);
  assert.equal(resolved.pageKey, 'prompt-iteration');
  assert.equal(resolved.maxRetries, 2);
  assert.deepEqual(resolved.requestOptions, { thinking: { type: 'enabled' } });
});
