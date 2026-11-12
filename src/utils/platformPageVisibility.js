import { APP_TABS, DATA_PREP_SUBTABS, TEST_SET_SUBTABS } from '../constants/labNavigation.js';
import { PLATFORM_PAGE_KEYS, TEMPORARILY_DEFERRED_PAGE_KEYS } from '../constants/platformPages.js';

const TEST_SET_PAGE_KEYS = [
  PLATFORM_PAGE_KEYS.PROMPT_ITERATION,
  PLATFORM_PAGE_KEYS.MODEL_VALIDATION,
  PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION
];

const DATA_PREP_PAGE_KEYS = [
  PLATFORM_PAGE_KEYS.CHUNKING,
  PLATFORM_PAGE_KEYS.PDF_COMPRESS,
  PLATFORM_PAGE_KEYS.TOKEN_ESTIMATION
];

const TEST_SET_SUBTAB_PAGE_KEYS = {
  'prompt-iteration': PLATFORM_PAGE_KEYS.PROMPT_ITERATION,
  'model-validation': PLATFORM_PAGE_KEYS.MODEL_VALIDATION,
  'prompt-optimization': PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION
};

const DATA_PREP_SUBTAB_PAGE_KEYS = {
  chunking: PLATFORM_PAGE_KEYS.CHUNKING,
  'pdf-compress': PLATFORM_PAGE_KEYS.PDF_COMPRESS,
  'token-estimation': PLATFORM_PAGE_KEYS.TOKEN_ESTIMATION
};

export function isPlatformPageEnabled(config, pageKey) {
  if (!config) {
    // 暂缓上线的功能在配置加载中/读取失败时也必须保持关闭。
    return !TEMPORARILY_DEFERRED_PAGE_KEYS.has(pageKey);
  }
  return config.pages?.[pageKey]?.enabled !== false;
}

export function isTopTabEnabled(config, tabKey) {
  if (tabKey === 'prompt-iteration') {
    return isPlatformPageEnabled(config, PLATFORM_PAGE_KEYS.PROMPT_ITERATION);
  }
  if (tabKey === 'model-validation') {
    return isPlatformPageEnabled(config, PLATFORM_PAGE_KEYS.MODEL_VALIDATION);
  }
  if (tabKey === 'prompt-optimization') {
    return isPlatformPageEnabled(config, PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION);
  }
  if (tabKey === 'test-workbench') {
    return TEST_SET_PAGE_KEYS.some((pageKey) => isPlatformPageEnabled(config, pageKey));
  }
  if (tabKey === 'data-prep') {
    return DATA_PREP_PAGE_KEYS.some((pageKey) => isPlatformPageEnabled(config, pageKey));
  }
  if (tabKey === 'online-validation') {
    return isPlatformPageEnabled(config, PLATFORM_PAGE_KEYS.ONLINE_VALIDATION);
  }
  if (tabKey === 'docs') {
    return isPlatformPageEnabled(config, PLATFORM_PAGE_KEYS.DOCS);
  }
  return true;
}

export function getVisibleTopTabs(config) {
  return APP_TABS.filter((tab) => isTopTabEnabled(config, tab.key));
}

export function getVisibleTestSetSubtabs(config) {
  return TEST_SET_SUBTABS.filter((tab) => (
    isPlatformPageEnabled(config, TEST_SET_SUBTAB_PAGE_KEYS[tab.key])
  ));
}

export function getVisibleDataPrepSubtabs(config) {
  if (!config) {
    return DATA_PREP_SUBTABS;
  }
  return DATA_PREP_SUBTABS.filter((tab) => (
    isPlatformPageEnabled(config, DATA_PREP_SUBTAB_PAGE_KEYS[tab.key])
  ));
}

export function getPageKeyForTestSetSubtab(subtabKey) {
  return TEST_SET_SUBTAB_PAGE_KEYS[subtabKey] || '';
}

export function getPageKeyForDataPrepSubtab(subtabKey) {
  return DATA_PREP_SUBTAB_PAGE_KEYS[subtabKey] || '';
}
