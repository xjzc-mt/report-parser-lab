import {
  DEFAULT_PRESET_DEFINITIONS,
  PLATFORM_DEFAULT_PRESET_ID,
  TRANSPORT_TYPES,
  VENDOR_KEYS
} from '../constants/modelPresets.js';

function readEnv(env, key) {
  return String(env?.[key] || '').trim();
}

function parseRequestOptions(value) {
  const raw = String(value || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function createReadonlyEnvPreset({
  id,
  name,
  transportType,
  vendorKey,
  baseUrl,
  modelName,
  credentialRef,
  capabilities,
  requestOptions = {},
  isDefault = true
}) {
  return {
    id,
    name,
    transportType,
    vendorKey,
    baseUrl,
    modelName,
    credentialMode: 'env',
    credentialRef,
    manualApiKey: '',
    capabilities: { ...(capabilities || {}) },
    requestOptions: { ...(requestOptions || {}) },
    status: 'active',
    isReadonly: true,
    isDefault,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function getVendorProfile(vendorKey) {
  switch (vendorKey) {
    case VENDOR_KEYS.GEMINI:
      return {
        transportType: TRANSPORT_TYPES.GEMINI_NATIVE,
        defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        capabilities: {
          supportsPdfUpload: true,
          supportsJsonMode: true,
          supportsVision: true,
          supportsStreaming: false
        }
      };
    case VENDOR_KEYS.CLAUDE:
      return {
        transportType: TRANSPORT_TYPES.ANTHROPIC_NATIVE,
        defaultBaseUrl: 'https://api.anthropic.com',
        capabilities: {
          supportsPdfUpload: false,
          supportsJsonMode: true,
          supportsVision: false,
          supportsStreaming: false
        }
      };
    case VENDOR_KEYS.GLM:
      return {
        transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
        defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        capabilities: {
          supportsPdfUpload: false,
          supportsJsonMode: true,
          supportsVision: true,
          supportsStreaming: true
        }
      };
    case VENDOR_KEYS.DEEPSEEK:
      return {
        transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
        defaultBaseUrl: 'https://api.deepseek.com',
        capabilities: {
          supportsPdfUpload: false,
          supportsJsonMode: true,
          supportsVision: false,
          supportsStreaming: true
        }
      };
    case VENDOR_KEYS.ONEAPI:
      return {
        transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
        defaultBaseUrl: '',
        capabilities: {
          supportsPdfUpload: false,
          supportsJsonMode: true,
          supportsVision: true,
          supportsStreaming: true
        }
      };
    case VENDOR_KEYS.OPENAI:
    case VENDOR_KEYS.CUSTOM:
    default:
      return {
        transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
        defaultBaseUrl: 'https://api.openai.com/v1',
        capabilities: {
          supportsPdfUpload: false,
          supportsJsonMode: true,
          supportsVision: true,
          supportsStreaming: true
        }
      };
  }
}

function inferVendorKey(env = {}) {
  const explicitVendor = readEnv(env, 'VITE_PLATFORM_DEFAULT_VENDOR').toLowerCase();
  if (Object.values(VENDOR_KEYS).includes(explicitVendor)) {
    return explicitVendor;
  }

  const transportType = readEnv(env, 'VITE_PLATFORM_DEFAULT_TRANSPORT');
  if (transportType === TRANSPORT_TYPES.GEMINI_NATIVE) {
    return VENDOR_KEYS.GEMINI;
  }
  if (transportType === TRANSPORT_TYPES.ANTHROPIC_NATIVE) {
    return VENDOR_KEYS.CLAUDE;
  }

  const baseUrl = readEnv(env, 'VITE_PLATFORM_DEFAULT_BASE_URL').toLowerCase();
  if (baseUrl.includes('googleapis.com')) return VENDOR_KEYS.GEMINI;
  if (baseUrl.includes('anthropic.com')) return VENDOR_KEYS.CLAUDE;
  if (baseUrl.includes('deepseek.com')) return VENDOR_KEYS.DEEPSEEK;
  if (baseUrl.includes('bigmodel.cn')) return VENDOR_KEYS.GLM;
  if (baseUrl) return VENDOR_KEYS.OPENAI;

  if (readEnv(env, 'VITE_GEMINI_API_KEY')) {
    return VENDOR_KEYS.GEMINI;
  }
  return VENDOR_KEYS.GEMINI;
}

function resolveTransportType(env = {}, vendorKey) {
  const explicitTransport = readEnv(env, 'VITE_PLATFORM_DEFAULT_TRANSPORT');
  if (Object.values(TRANSPORT_TYPES).includes(explicitTransport)) {
    return explicitTransport;
  }
  return getVendorProfile(vendorKey).transportType;
}

function mapPresetToProviderType(preset) {
  if (preset?.transportType === TRANSPORT_TYPES.GEMINI_NATIVE) return 'gemini';
  if (preset?.transportType === TRANSPORT_TYPES.ANTHROPIC_NATIVE) return 'anthropic';
  if (preset?.vendorKey === VENDOR_KEYS.ONEAPI) return 'openai';
  return preset?.vendorKey || 'openai';
}

export function resolvePlatformDefaultConnection(env = import.meta.env) {
  const vendorKey = inferVendorKey(env);
  const profile = getVendorProfile(vendorKey);

  return {
    vendorKey,
    transportType: resolveTransportType(env, vendorKey),
    baseUrl: readEnv(env, 'VITE_PLATFORM_DEFAULT_BASE_URL') || profile.defaultBaseUrl,
    modelName: readEnv(env, 'VITE_PLATFORM_DEFAULT_MODEL') || (
      vendorKey === VENDOR_KEYS.GEMINI ? 'gemini-2.5-pro' : ''
    ),
    providerType: mapPresetToProviderType({
      vendorKey,
      transportType: resolveTransportType(env, vendorKey)
    }),
    capabilities: { ...profile.capabilities },
    requestOptions: parseRequestOptions(readEnv(env, 'VITE_PLATFORM_DEFAULT_REQUEST_OPTIONS'))
  };
}

export function buildPlatformDefaultPreset(env = {}) {
  const explicitApiKey = readEnv(env, 'VITE_PLATFORM_DEFAULT_API_KEY');
  const legacyGeminiApiKey = readEnv(env, 'VITE_GEMINI_API_KEY');
  const connection = resolvePlatformDefaultConnection(env);
  const apiKey = explicitApiKey || (
    connection.vendorKey === VENDOR_KEYS.GEMINI ? legacyGeminiApiKey : ''
  );

  if (!apiKey || !connection.modelName) {
    return null;
  }

  return createReadonlyEnvPreset({
    id: PLATFORM_DEFAULT_PRESET_ID,
    name: readEnv(env, 'VITE_PLATFORM_DEFAULT_PRESET_NAME') || '平台默认模型',
    transportType: connection.transportType,
    vendorKey: connection.vendorKey,
    baseUrl: connection.baseUrl,
    modelName: connection.modelName,
    credentialRef: explicitApiKey ? 'VITE_PLATFORM_DEFAULT_API_KEY' : 'VITE_GEMINI_API_KEY',
    capabilities: connection.capabilities,
    requestOptions: connection.requestOptions
  });
}

export function buildVendorEnvDefaultPresets(env = {}) {
  return DEFAULT_PRESET_DEFINITIONS
    .map((definition) => {
      const apiKey = readEnv(env, definition.apiKeyEnv);
      const modelName = readEnv(env, definition.modelEnv);
      if (!apiKey || !modelName) {
        return null;
      }

      return createReadonlyEnvPreset({
        id: definition.id,
        name: definition.name,
        transportType: definition.transportType,
        vendorKey: definition.vendorKey,
        baseUrl: readEnv(env, definition.baseUrlEnv) || definition.defaultBaseUrl || '',
        modelName,
        credentialRef: definition.apiKeyEnv,
        capabilities: definition.capabilities,
        requestOptions: parseRequestOptions(readEnv(env, definition.requestOptionsEnv))
      });
    })
    .filter(Boolean);
}

export function buildAllEnvDefaultPresets(env = {}) {
  const platformPreset = buildPlatformDefaultPreset(env);
  const vendorPresets = buildVendorEnvDefaultPresets(env);
  return [
    ...(platformPreset ? [platformPreset] : []),
    ...vendorPresets
  ];
}

export function resolvePlatformDefaultRuntimeConfig(env = import.meta.env) {
  const connection = resolvePlatformDefaultConnection(env);
  const platformPreset = buildPlatformDefaultPreset(env);

  return {
    presetId: platformPreset?.id || '',
    presetName: platformPreset?.name || '平台默认模型',
    apiUrl: connection.baseUrl,
    apiKey: readEnv(env, 'VITE_PLATFORM_DEFAULT_API_KEY') || (
      connection.vendorKey === VENDOR_KEYS.GEMINI ? readEnv(env, 'VITE_GEMINI_API_KEY') : ''
    ),
    modelName: connection.modelName,
    providerType: connection.providerType,
    capabilities: { ...connection.capabilities },
    requestOptions: { ...(connection.requestOptions || {}) }
  };
}

export function resolveSettingsWithPlatformDefaults(settings = {}, env = import.meta.env) {
  const runtimeConfig = resolvePlatformDefaultRuntimeConfig(env);
  const pageRequestOptions = settings?.requestOptions && typeof settings.requestOptions === 'object' && !Array.isArray(settings.requestOptions)
    ? settings.requestOptions
    : {};

  return {
    ...settings,
    apiUrl: String(settings?.apiUrl || '').trim() || runtimeConfig.apiUrl || '',
    apiKey: String(settings?.apiKey || '').trim() || runtimeConfig.apiKey || '',
    modelName: String(settings?.modelName || '').trim() || runtimeConfig.modelName || '',
    providerType: String(settings?.providerType || '').trim() || runtimeConfig.providerType || '',
    requestOptions: Object.keys(pageRequestOptions).length > 0
      ? { ...pageRequestOptions }
      : { ...(runtimeConfig.requestOptions || {}) }
  };
}
