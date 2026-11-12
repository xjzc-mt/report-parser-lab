const VENDOR_LABELS = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'OpenAI',
  oneapi: 'OneAPI',
  mio: 'MIO-妙盈',
  deepseek: 'DeepSeek',
  glm: 'GLM',
  custom: '自定义'
};

export function getPresetProviderId(preset) {
  if (preset?.companyConnectionId) {
    return `company:${preset.companyConnectionId}`;
  }
  return `vendor:${preset?.vendorKey || 'custom'}`;
}

export function getPresetProviderLabel(preset) {
  if (preset?.companyConnectionId) {
    return preset.companyConnectionName || preset.name || '公司连接';
  }
  return VENDOR_LABELS[preset?.vendorKey] || preset?.vendorKey || '自定义';
}

export function groupPresetsByProvider(presets = []) {
  const groups = new Map();

  for (const preset of Array.isArray(presets) ? presets : []) {
    if (!preset?.id) {
      continue;
    }
    const id = getPresetProviderId(preset);
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: getPresetProviderLabel(preset),
        presets: []
      });
    }
    groups.get(id).presets.push(preset);
  }

  return Array.from(groups.values());
}
