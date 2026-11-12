import {
  createDefaultPageConfig,
  normalizePageConfig,
  PLATFORM_PAGE_KEY_SET
} from '../constants/platformPages.js';

const DEFAULT_CAPABILITIES = {
  supportsPdfUpload: false,
  supportsJsonMode: true,
  supportsVision: false,
  supportsStreaming: false
};

function asString(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeConnection(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = asString(raw.id, 80);
  const name = asString(raw.name, 80);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    transportType: asString(raw.transportType, 40) || 'openai_compatible',
    vendorKey: asString(raw.vendorKey, 40) || 'custom',
    enabled: Boolean(raw.enabled),
    keyConfigured: Boolean(raw.keyConfigured),
    models: (Array.isArray(raw.models) ? raw.models : [])
      .map((model) => {
        const modelName = asString(model?.name, 200);
        if (!modelName) return null;
        return {
          name: modelName,
          enabled: model?.enabled === undefined ? true : Boolean(model.enabled),
          capabilities: {
            ...DEFAULT_CAPABILITIES,
            ...(model?.capabilities && typeof model.capabilities === 'object' ? model.capabilities : {})
          }
        };
      })
      .filter(Boolean)
  };
}

export function normalizePublicConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    version: Number(source.version || 1),
    updatedAt: asString(source.updatedAt, 40),
    companyConnections: (Array.isArray(source.companyConnections) ? source.companyConnections : [])
      .map(normalizeConnection)
      .filter(Boolean),
    pages: normalizePageConfig(source.pages)
  };
}

export function createEmptyPublicConfig() {
  return {
    version: 1,
    updatedAt: '',
    companyConnections: [],
    pages: createDefaultPageConfig()
  };
}

export async function fetchPlatformConfig({ fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境不支持读取平台配置。');
  }

  const response = await fetchImpl('/api/public/config', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    signal
  });
  if (!response.ok) {
    throw new Error(`平台配置读取失败（HTTP ${response.status}）。`);
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error('平台配置返回了无法解析的内容。');
  }
  return normalizePublicConfig(data);
}

export function buildCompanyPresetId(connectionId, modelName) {
  return `company:${connectionId}:${modelName}`;
}

export function isCompanyPreset(preset) {
  return preset?.credentialMode === 'company';
}

export function buildCompanyPresets(config) {
  const connections = Array.isArray(config?.companyConnections) ? config.companyConnections : [];
  const timestamp = Date.parse(config?.updatedAt || '') || 0;
  const presets = [];

  for (const connection of connections) {
    const connectionEnabled = Boolean(connection.enabled);
    const keyConfigured = Boolean(connection.keyConfigured);
    for (const model of connection.models) {
      const modelEnabled = model.enabled !== false;
      const available = connectionEnabled && keyConfigured && modelEnabled;
      let unavailableReason = '';
      if (!connectionEnabled) {
        unavailableReason = '公司连接已在后台禁用';
      } else if (!keyConfigured) {
        unavailableReason = '公司连接尚未配置 API Key';
      } else if (!modelEnabled) {
        unavailableReason = '该模型已在后台禁用';
      }

      presets.push({
        id: buildCompanyPresetId(connection.id, model.name),
        name: `${connection.name} · ${model.name}`,
        transportType: 'company_proxy',
        vendorKey: connection.vendorKey,
        baseUrl: '',
        modelName: model.name,
        credentialMode: 'company',
        companyConnectionId: connection.id,
        companyConnectionName: connection.name,
        companyTransportType: connection.transportType,
        capabilities: { ...DEFAULT_CAPABILITIES, ...(model.capabilities || {}) },
        requestOptions: {},
        status: available ? 'active' : 'disabled',
        isReadonly: true,
        isDefault: false,
        available,
        unavailableReason,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  }

  return presets;
}

export function isKnownPlatformPage(pageKey) {
  return PLATFORM_PAGE_KEY_SET.has(pageKey);
}
