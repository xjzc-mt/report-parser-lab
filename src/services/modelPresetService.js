import {
  loadGlobalDefaultModelSelection,
  loadModelPresets,
  cleanupLegacyLlmSettings,
  saveGlobalDefaultModelSelection,
  saveModelPresets,
  loadAllPageModelSelections
} from '../utils/modelPresetStorage.js';
import { VENDOR_KEYS } from '../constants/modelPresets.js';

function isCompanyPresetId(presetId) {
  return String(presetId || '').startsWith('company:');
}

export function isPersistablePreset(preset) {
  return Boolean(preset)
    && preset.credentialMode !== 'company'
    && preset.credentialMode !== 'env';
}

export function filterPersistablePresets(presets = []) {
  return (Array.isArray(presets) ? presets : []).filter(isPersistablePreset);
}

export function mergePresetCollections(...collections) {
  const seen = new Set();
  const merged = [];

  collections.flat().forEach((item) => {
    if (!item?.id || seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    merged.push(item);
  });

  return merged;
}

/**
 * 早期个人预设默认使用 MIO-妙盈；该供应商现由公司在 /admin 统一维护，
 * 个人配置改为 OpenAI 兼容协议（同一接口地址，无需重新填写 Key）。
 */
export function migrateLegacyPersonalPresets(presets = []) {
  return (Array.isArray(presets) ? presets : []).map((preset) => (
    preset?.vendorKey === VENDOR_KEYS.MIO
      ? { ...preset, vendorKey: VENDOR_KEYS.OPENAI }
      : preset
  ));
}

export function initializeModelPresetSystem() {
  cleanupLegacyLlmSettings();
  const existingPresets = migrateLegacyPersonalPresets(filterPersistablePresets(loadModelPresets()));
  const existingSelections = loadAllPageModelSelections();
  const existingGlobalDefaultPresetId = loadGlobalDefaultModelSelection();
  const presets = mergePresetCollections(existingPresets);

  saveModelPresets(presets);

  const keepExistingGlobal = existingGlobalDefaultPresetId
    && (isCompanyPresetId(existingGlobalDefaultPresetId)
      || presets.some((item) => item.id === existingGlobalDefaultPresetId));
  const nextGlobalDefaultPresetId = keepExistingGlobal
    ? existingGlobalDefaultPresetId
    : (presets.find((item) => item.isDefault)?.id || presets[0]?.id || '');

  saveGlobalDefaultModelSelection(nextGlobalDefaultPresetId);

  return {
    presets,
    selections: existingSelections,
    globalDefaultPresetId: nextGlobalDefaultPresetId
  };
}
