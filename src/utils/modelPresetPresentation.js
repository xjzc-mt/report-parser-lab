import { getPresetCapabilityError } from '../services/modelPresetResolver.js';

function formatCapabilityLabel(capabilities = {}) {
  const labels = [];
  if (capabilities.supportsPdfUpload) labels.push('PDF');
  if (capabilities.supportsJsonMode) labels.push('JSON');
  if (capabilities.supportsVision) labels.push('Vision');
  if (capabilities.supportsStreaming) labels.push('Streaming');
  return labels.join(' / ');
}

export function buildPresetSelectOptions(presets = [], requiredCapabilities = {}) {
  return presets.map((preset) => {
    const capabilityError = getPresetCapabilityError(preset, requiredCapabilities);
    const capabilityLabel = formatCapabilityLabel(preset.capabilities);
    const suffix = capabilityError ? ` · ${capabilityError}` : '';

    return {
      value: preset.id,
      label: `${preset.name} · ${preset.vendorKey} · ${preset.modelName}${suffix}`,
      description: capabilityError || capabilityLabel || '',
      disabled: Boolean(capabilityError),
      preset
    };
  });
}

export function formatPresetSummary(preset, runtimeConfig) {
  if (!preset) {
    return {
      title: '未选择模型预设',
      meta: '请先在设置中创建或启用模型预设。'
    };
  }

  const hasRequestOptions = preset.requestOptions
    && typeof preset.requestOptions === 'object'
    && !Array.isArray(preset.requestOptions)
    && Object.keys(preset.requestOptions).length > 0;
  const advancedLabel = hasRequestOptions ? ' · 高级参数' : '';

  return {
    title: preset.name,
    meta: `${preset.vendorKey} · ${preset.modelName}${advancedLabel}${runtimeConfig?.apiKey ? '' : ' · Key 缺失'}`
  };
}
