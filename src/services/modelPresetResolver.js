import { VENDOR_KEYS } from '../constants/modelPresets.js';

function mapPresetToProviderType(preset) {
  if (preset?.transportType === 'gemini_native') return 'gemini';
  if (preset?.transportType === 'anthropic_native') return 'anthropic';
  if (preset?.vendorKey === VENDOR_KEYS.ONEAPI) return 'openai';
  return preset?.vendorKey || 'openai';
}

function resolvePresetApiKey(preset, env = import.meta.env) {
  if (!preset) return '';
  if (preset.credentialMode === 'env') {
    return String(env?.[preset.credentialRef] || '').trim();
  }
  return String(preset.manualApiKey || '').trim();
}

export function resolveRuntimeLlmConfig(preset, env = import.meta.env) {
  if (!preset) {
    return null;
  }

  return {
    presetId: preset.id,
    presetName: preset.name,
    apiUrl: String(preset.baseUrl || '').trim(),
    apiKey: resolvePresetApiKey(preset, env),
    modelName: String(preset.modelName || '').trim(),
    providerType: mapPresetToProviderType(preset),
    capabilities: { ...(preset.capabilities || {}) },
    requestOptions: { ...(preset.requestOptions || {}) }
  };
}

export function getPresetCapabilityError(preset, requiredCapabilities = {}) {
  if (!preset) {
    return '未找到可用模型预设。';
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

export function resolvePagePreset(pageKey, presets = [], selections = {}, globalDefaultPresetId = '') {
  const selectedPresetId = selections?.[pageKey];
  if (selectedPresetId) {
    const matched = presets.find((item) => item.id === selectedPresetId);
    if (matched) {
      return matched;
    }
  }

  if (globalDefaultPresetId) {
    const globalDefaultPreset = presets.find((item) => item.id === globalDefaultPresetId);
    if (globalDefaultPreset) {
      return globalDefaultPreset;
    }
  }

  return presets.find((item) => item.isDefault) || presets[0] || null;
}
