import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompanyPresets,
  fetchPlatformConfig,
  isCompanyPreset,
  normalizePublicConfig
} from '../src/services/platformConfigService.js';

function createRawConfig() {
  return {
    version: 1,
    updatedAt: '2026-11-02T00:00:00.000Z',
    companyConnections: [
      {
        id: 'conn_1',
        name: '公司 OneAPI',
        transportType: 'openai_compatible',
        vendorKey: 'oneapi',
        enabled: true,
        keyConfigured: true,
        apiKey: 'should-not-survive',
        baseUrl: 'https://secret.example/v1',
        requestOptions: { secret: true },
        models: [
          {
            name: 'model-a',
            enabled: true,
            requestOptions: { secret: true },
            capabilities: {
              supportsPdfUpload: false,
              supportsJsonMode: true,
              supportsVision: false,
              supportsStreaming: true
            }
          }
        ]
      },
      {
        id: 'conn_2',
        name: '未配置 Key',
        transportType: 'openai_compatible',
        vendorKey: 'oneapi',
        enabled: true,
        keyConfigured: false,
        models: [{ name: 'model-b', enabled: true, capabilities: { supportsJsonMode: true } }]
      },
      {
        id: 'conn_3',
        name: '已禁用',
        transportType: 'openai_compatible',
        vendorKey: 'oneapi',
        enabled: false,
        keyConfigured: true,
        models: [{ name: 'model-c', enabled: true, capabilities: { supportsJsonMode: true } }]
      }
    ],
    pages: {
      'prompt-iteration': { enabled: false, defaults: { maxRetries: 4 } }
    }
  };
}

test('normalizePublicConfig 丢弃 Key、Base URL 和内部请求参数', () => {
  const config = normalizePublicConfig(createRawConfig());
  const connection = config.companyConnections[0];

  assert.equal(connection.apiKey, undefined);
  assert.equal(connection.baseUrl, undefined);
  assert.equal(connection.requestOptions, undefined);
  assert.equal(connection.models[0].requestOptions, undefined);
  assert.equal(JSON.stringify(config).includes('should-not-survive'), false);
  assert.equal(JSON.stringify(config).includes('secret.example'), false);
  assert.equal(config.pages['prompt-iteration'].enabled, false);
  assert.equal(config.pages['prompt-iteration'].defaults.maxRetries, 4);
});

test('buildCompanyPresets 将可用模型转换成只读公司预设', () => {
  const presets = buildCompanyPresets(normalizePublicConfig(createRawConfig()));
  const preset = presets.find((item) => item.modelName === 'model-a');

  assert.equal(preset.id, 'company:conn_1:model-a');
  assert.equal(preset.name, '公司 OneAPI · model-a');
  assert.equal(preset.credentialMode, 'company');
  assert.equal(preset.transportType, 'company_proxy');
  assert.equal(preset.companyConnectionId, 'conn_1');
  assert.equal(preset.companyTransportType, 'openai_compatible');
  assert.equal(preset.available, true);
  assert.equal(preset.isReadonly, true);
  assert.equal(preset.capabilities.supportsJsonMode, true);
  assert.equal(isCompanyPreset(preset), true);
  assert.equal('apiKey' in preset, false);
  assert.equal(preset.baseUrl, '');
});

test('buildCompanyPresets 对未配置 Key、禁用连接和禁用模型给出不可用原因', () => {
  const presets = buildCompanyPresets(normalizePublicConfig(createRawConfig()));

  const noKey = presets.find((item) => item.modelName === 'model-b');
  assert.equal(noKey.available, false);
  assert.match(noKey.unavailableReason, /尚未配置 API Key/);

  const disabled = presets.find((item) => item.modelName === 'model-c');
  assert.equal(disabled.available, false);
  assert.match(disabled.unavailableReason, /连接已在后台禁用/);
});

test('fetchPlatformConfig 成功返回规范化配置，失败抛出可读错误', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(createRawConfig()), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
  try {
    const config = await fetchPlatformConfig();
    assert.equal(config.companyConnections.length, 3);
    assert.equal(JSON.stringify(config).includes('should-not-survive'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'down' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
  try {
    await assert.rejects(() => fetchPlatformConfig(), /HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
