import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultPageConfig } from '../src/constants/platformPages.js';
import {
  getVisibleDataPrepSubtabs,
  getVisibleTestSetSubtabs,
  getVisibleTopTabs,
  isPlatformPageEnabled,
  isTopTabEnabled
} from '../src/utils/platformPageVisibility.js';

function createConfig(overrides = {}) {
  return {
    pages: {
      ...createDefaultPageConfig(),
      ...overrides
    }
  };
}

test('无配置时普通页面默认开放，暂缓上线的自动优化保持关闭', () => {
  assert.equal(getVisibleTopTabs(null).length, 5);
  assert.equal(getVisibleTestSetSubtabs(null).length, 2);
  assert.equal(getVisibleDataPrepSubtabs(null).length, 3);
  assert.equal(isPlatformPageEnabled(null, 'prompt-iteration'), true);
  assert.equal(isPlatformPageEnabled(null, 'prompt-optimization'), false);
});

test('前台平铺页面被后台关闭时，对应一级入口独立隐藏', () => {
  const config = createConfig({
    'prompt-iteration': { enabled: false, defaults: { maxRetries: 3 } },
    'model-validation': { enabled: false, defaults: {} },
    'prompt-optimization': { enabled: true, defaults: {} }
  });

  assert.equal(isTopTabEnabled(config, 'prompt-iteration'), false);
  assert.equal(isTopTabEnabled(config, 'model-validation'), false);
  assert.equal(isTopTabEnabled(config, 'prompt-optimization'), true);
  assert.deepEqual(getVisibleTopTabs(config).map((tab) => tab.key), [
    'prompt-optimization',
    'online-validation',
    'data-prep',
    'docs'
  ]);
});

test('兼容测试集全部关闭时对应旧工作台 key 返回 false', () => {
  const config = createConfig({
    'prompt-iteration': { enabled: false, defaults: { maxRetries: 3 } },
    'model-validation': { enabled: false, defaults: {} },
    'prompt-optimization': { enabled: false, defaults: {} }
  });

  assert.equal(isTopTabEnabled(config, 'test-workbench'), false);
});

test('数据预处理子工具全部关闭时隐藏数据预处理一级入口', () => {
  const allClosedConfig = createConfig({
    chunking: { enabled: false, defaults: {} },
    'pdf-compress': { enabled: false, defaults: {} },
    'token-estimation': { enabled: false, defaults: {} }
  });

  assert.equal(isTopTabEnabled(allClosedConfig, 'data-prep'), false);
  assert.equal(getVisibleTopTabs(allClosedConfig).some((tab) => tab.key === 'data-prep'), false);
  assert.deepEqual(getVisibleDataPrepSubtabs(allClosedConfig), []);

  const partiallyOpenConfig = createConfig({
    chunking: { enabled: false, defaults: {} },
    'pdf-compress': { enabled: false, defaults: {} },
    'token-estimation': { enabled: true, defaults: {} }
  });

  assert.equal(isTopTabEnabled(partiallyOpenConfig, 'data-prep'), true);
  assert.deepEqual(getVisibleDataPrepSubtabs(partiallyOpenConfig).map((tab) => tab.key), ['token-estimation']);
});

test('说明文档和线上验证可以独立关闭', () => {
  const config = createConfig({
    'online-validation': { enabled: false, defaults: {} },
    docs: { enabled: false, defaults: {} }
  });
  const visible = getVisibleTopTabs(config).map((tab) => tab.key);

  assert.equal(visible.includes('online-validation'), false);
  assert.equal(visible.includes('docs'), false);
});

test('新建默认页面配置时自动优化默认关闭', () => {
  const defaults = createDefaultPageConfig();
  assert.equal(defaults['prompt-optimization'].enabled, false);
  assert.equal(defaults['prompt-iteration'].enabled, true);
});
