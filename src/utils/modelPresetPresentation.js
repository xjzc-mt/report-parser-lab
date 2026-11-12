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
    const sourceLabel = preset.credentialMode === 'company' ? '公司托管' : preset.vendorKey;

    return {
      value: preset.id,
      label: `${preset.name} · ${sourceLabel} · ${preset.modelName}${suffix}`,
      description: capabilityError || capabilityLabel || '',
      disabled: Boolean(capabilityError),
      preset
    };
  });
}

export function formatPresetSummary(preset, runtimeConfig) {
  if (!preset) {
    return {
      title: runtimeConfig?.staleSelection ? '原模型预设已失效' : '未选择模型预设',
      meta: runtimeConfig?.staleSelection
        ? '请重新选择模型预设；系统不会自动切换到其他模型。'
        : '请先在设置中创建或启用模型预设。'
    };
  }

  const hasRequestOptions = preset.requestOptions
    && typeof preset.requestOptions === 'object'
    && !Array.isArray(preset.requestOptions)
    && Object.keys(preset.requestOptions).length > 0;
  const advancedLabel = hasRequestOptions ? ' · 高级参数' : '';
  const credentialLabel = runtimeConfig?.serverManaged
    ? ' · 公司托管'
    : (runtimeConfig?.credentialsReady ? '' : ' · Key 缺失');

  return {
    title: preset.name,
    meta: `${preset.vendorKey} · ${preset.modelName}${advancedLabel}${credentialLabel}`
  };
}
