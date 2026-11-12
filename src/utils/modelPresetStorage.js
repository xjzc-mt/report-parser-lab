import {
  GLOBAL_MODEL_SELECTION_STORAGE_KEY,
  MODEL_PRESET_STORAGE_KEY,
  PAGE_MODEL_SELECTIONS_STORAGE_KEY
} from '../constants/modelPresets.js';

const LEGACY_LLM_STORAGE_KEYS = ['intelliextract_llm1', 'intelliextract_llm2'];

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function getLocalStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function filterStoredPresets(presets) {
  return (Array.isArray(presets) ? presets : []).filter((preset) => (
    preset && preset.credentialMode !== 'company'
  ));
}

export function loadModelPresets() {
  const storage = getLocalStorage();
  if (!storage) return [];
  return filterStoredPresets(safeJsonParse(storage.getItem(MODEL_PRESET_STORAGE_KEY), []));
}

export function saveModelPresets(presets) {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(MODEL_PRESET_STORAGE_KEY, JSON.stringify(filterStoredPresets(presets)));
}

export function loadAllPageModelSelections() {
  const storage = getLocalStorage();
  if (!storage) return {};
  return safeJsonParse(storage.getItem(PAGE_MODEL_SELECTIONS_STORAGE_KEY), {});
}

export function loadGlobalDefaultModelSelection() {
  const storage = getLocalStorage();
  if (!storage) return '';
  return String(storage.getItem(GLOBAL_MODEL_SELECTION_STORAGE_KEY) || '').trim();
}

export function saveGlobalDefaultModelSelection(presetId) {
  const storage = getLocalStorage();
  if (!storage) return;
  const nextValue = String(presetId || '').trim();
  if (!nextValue) {
    storage.removeItem(GLOBAL_MODEL_SELECTION_STORAGE_KEY);
    return;
  }
  storage.setItem(GLOBAL_MODEL_SELECTION_STORAGE_KEY, nextValue);
}

export function loadPageModelSelection(pageKey) {
  return loadAllPageModelSelections()[pageKey] || '';
}

export function savePageModelSelection(pageKey, presetId) {
  const storage = getLocalStorage();
  if (!storage || !pageKey) return;
  const next = {
    ...loadAllPageModelSelections(),
    [pageKey]: presetId
  };
  storage.setItem(PAGE_MODEL_SELECTIONS_STORAGE_KEY, JSON.stringify(next));
}

export function clearPageModelSelection(pageKey) {
  const storage = getLocalStorage();
  if (!storage || !pageKey) return;
  const next = { ...loadAllPageModelSelections() };
  delete next[pageKey];
  storage.setItem(PAGE_MODEL_SELECTIONS_STORAGE_KEY, JSON.stringify(next));
}

export function cleanupLegacyLlmSettings() {
  const storage = getLocalStorage();
  if (!storage) return;
  LEGACY_LLM_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
}
