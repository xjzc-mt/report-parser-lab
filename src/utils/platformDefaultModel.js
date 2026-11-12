import {
  PLATFORM_DEFAULT_PRESET_ID,
  TRANSPORT_TYPES,
  VENDOR_KEYS
} from '../constants/modelPresets.js';

const PUBLIC_ENV = typeof __LLM_LAB_PUBLIC_ENV__ !== 'undefined' ? __LLM_LAB_PUBLIC_ENV__ : {};

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
    case VENDOR_KEYS.MIO:
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
  if (baseUrl.includes('one-api') || baseUrl.includes('miotech')) return VENDOR_KEYS.MIO;
  if (baseUrl) return VENDOR_KEYS.OPENAI;

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
  if (preset?.transportType === TRANSPORT_TYPES.COMPANY_PROXY) return 'company';
  if (preset?.transportType === TRANSPORT_TYPES.GEMINI_NATIVE) return 'gemini';
  if (preset?.transportType === TRANSPORT_TYPES.ANTHROPIC_NATIVE) return 'anthropic';
  if (preset?.vendorKey === VENDOR_KEYS.ONEAPI) return 'openai';
  return preset?.vendorKey || 'openai';
}

export function resolvePlatformDefaultConnection(env = PUBLIC_ENV) {
  const vendorKey = inferVendorKey(env);
  const profile = getVendorProfile(vendorKey);
  const transportType = resolveTransportType(env, vendorKey);

  return {
    vendorKey,
    transportType,
    baseUrl: readEnv(env, 'VITE_PLATFORM_DEFAULT_BASE_URL') || profile.defaultBaseUrl,
    modelName: readEnv(env, 'VITE_PLATFORM_DEFAULT_MODEL') || '',
    providerType: mapPresetToProviderType({ vendorKey, transportType }),
    capabilities: { ...profile.capabilities },
    requestOptions: parseRequestOptions(readEnv(env, 'VITE_PLATFORM_DEFAULT_REQUEST_OPTIONS'))
  };
}

export function resolvePlatformDefaultRuntimeConfig(env = PUBLIC_ENV) {
  const connection = resolvePlatformDefaultConnection(env);

  return {
    presetId: PLATFORM_DEFAULT_PRESET_ID,
    presetName: readEnv(env, 'VITE_PLATFORM_DEFAULT_PRESET_NAME') || '平台默认模型',
    apiUrl: connection.baseUrl,
    apiKey: '',
    modelName: connection.modelName,
    providerType: connection.providerType,
    capabilities: { ...connection.capabilities },
    requestOptions: { ...(connection.requestOptions || {}) }
  };
}

export function resolveSettingsWithPlatformDefaults(settings = {}, env = PUBLIC_ENV) {
  const runtimeConfig = resolvePlatformDefaultRuntimeConfig(env);
  const pageRequestOptions = settings?.requestOptions && typeof settings.requestOptions === 'object' && !Array.isArray(settings.requestOptions)
    ? { ...settings.requestOptions }
    : {};

  if (settings?.serverManaged) {
    return {
      ...settings,
      apiUrl: String(settings?.apiUrl || '').trim(),
      apiKey: '',
      modelName: String(settings?.modelName || '').trim() || runtimeConfig.modelName || '',
      providerType: String(settings?.providerType || '').trim() || 'company',
      requestOptions: pageRequestOptions
    };
  }

  return {
    ...settings,
    apiUrl: String(settings?.apiUrl || '').trim() || runtimeConfig.apiUrl || '',
    apiKey: String(settings?.apiKey || '').trim(),
    modelName: String(settings?.modelName || '').trim() || runtimeConfig.modelName || '',
    providerType: String(settings?.providerType || '').trim() || runtimeConfig.providerType || '',
    requestOptions: Object.keys(pageRequestOptions).length > 0
      ? pageRequestOptions
      : { ...(runtimeConfig.requestOptions || {}) }
  };
}
