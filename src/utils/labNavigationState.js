import { APP_TABS, DATA_PREP_SUBTABS } from '../constants/labNavigation.js';

export const LS_ACTIVE_APP_TAB = 'llm_lab_active_tab';
export const LS_DATA_PREP_SUBTAB = 'llm_lab_data_prep_subtab';

export const DEFAULT_APP_TAB_KEY = 'prompt-iteration';
export const DEFAULT_DATA_PREP_SUBTAB_KEY = 'chunking';

const VALID_APP_TAB_KEYS = new Set(APP_TABS.map((tab) => tab.key));
const VALID_DATA_PREP_SUBTAB_KEYS = new Set(DATA_PREP_SUBTABS.map((tab) => tab.key));

export function normalizeAppTabKey(value) {
  const normalizedValue = String(value || '').trim();
  if (normalizedValue === 'test-workbench') {
    return DEFAULT_APP_TAB_KEY;
  }
  return VALID_APP_TAB_KEYS.has(normalizedValue)
    ? normalizedValue
    : DEFAULT_APP_TAB_KEY;
}

export function normalizeDataPrepSubtabKey(value) {
  const normalizedValue = String(value || '').trim();
  return VALID_DATA_PREP_SUBTAB_KEYS.has(normalizedValue)
    ? normalizedValue
    : DEFAULT_DATA_PREP_SUBTAB_KEY;
}
