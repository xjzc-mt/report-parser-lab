import { TRANSPORT_TYPES, VENDOR_KEYS } from '../constants/modelPresets.js';

function mapPresetToProviderType(preset) {
  if (preset?.transportType === TRANSPORT_TYPES.COMPANY_PROXY || preset?.credentialMode === 'company') {
    return 'company';
  }
  if (preset?.transportType === TRANSPORT_TYPES.GEMINI_NATIVE) return 'gemini';
  if (preset?.transportType === TRANSPORT_TYPES.ANTHROPIC_NATIVE) return 'anthropic';
  if (preset?.vendorKey === VENDOR_KEYS.ONEAPI) return 'openai';
  return preset?.vendorKey || 'openai';
}

function resolvePresetApiKey(preset) {
  if (!preset || preset.credentialMode === 'company' || preset.credentialMode === 'env') {
    return '';
  }
  return String(preset.manualApiKey || '').trim();
}

export function resolveRuntimeLlmConfig(preset) {
  if (!preset) {
    return null;
  }

  const apiKey = resolvePresetApiKey(preset);
  const serverManaged = preset.credentialMode === 'company'
    || preset.transportType === TRANSPORT_TYPES.COMPANY_PROXY;
  const available = preset.available !== false;

  return {
    presetId: preset.id,
    presetName: preset.name,
    apiUrl: String(preset.baseUrl || '').trim(),
    apiKey,
    modelName: String(preset.modelName || '').trim(),
    providerType: mapPresetToProviderType(preset),
    capabilities: { ...(preset.capabilities || {}) },
    supportsPdfUpload: Boolean(preset.capabilities?.supportsPdfUpload),
    requestOptions: { ...(preset.requestOptions || {}) },
    credentialMode: preset.credentialMode || 'manual',
    credentialsReady: available && (serverManaged || Boolean(apiKey)),
    serverManaged,
    companyConnectionId: preset.companyConnectionId || '',
    companyConnectionName: preset.companyConnectionName || '',
    available,
    unavailableReason: preset.unavailableReason || '',
    pageKey: preset.pageKey || ''
  };
}

export function getPresetCapabilityError(preset, requiredCapabilities = {}) {
  if (!preset) {
    return '未找到可用模型预设。';
  }
  if (preset.available === false) {
    return String(preset.unavailableReason || '该模型预设当前不可用。');
  }
  if (preset.credentialMode === 'company' && preset.status === 'disabled') {
    return '公司模型连接不可用。';
  }

  const capabilities = preset.capabilities || {};
  if (requiredCapabilities.supportsPdfUpload && !capabilities.supportsPdfUpload) {
    return '当前页面要求 PDF 直传，该预设不支持。';
  }
  if (requiredCapabilities.supportsJsonMode && !capabilities.supportsJsonMode) {
    return '当前页面要求 JSON 输出能力，该预设不支持。';
  }
  if (requiredCapabilities.supportsVision && !capabilities.supportsVision) {
    return '当前页面要求视觉能力，该预设不支持。';
  }
  return '';
}

export function resolvePagePreset(pageKey, presets = [], selections = {}) {
  const selectedPresetId = selections?.[pageKey];
  if (!selectedPresetId) {
    // 不再使用全局默认；页面必须显式选择供应商和模型。
    return null;
  }
  // 显式选择失效时返回 null，由页面提示重新选择，不静默切换到其他模型。
  return presets.find((item) => item.id === selectedPresetId) || null;
}

export function hasRuntimeCredentials(runtimeConfig) {
  return Boolean(runtimeConfig?.credentialsReady);
}
