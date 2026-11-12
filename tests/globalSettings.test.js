import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../src/constants/extraction.js';
import { applyPageDefaultsToGlobalSettings, normalizeGlobalSettings } from '../src/utils/globalSettings.js';

test('normalizeGlobalSettings 在 indicatorTypes 非数组时回退默认值', () => {
  const normalized = normalizeGlobalSettings({
    batchSize: 100,
    indicatorTypes: null
  });

  assert.equal(normalized.batchSize, 100);
  assert.deepEqual(normalized.indicatorTypes, DEFAULT_SETTINGS.indicatorTypes);
});

test('normalizeGlobalSettings 会过滤非法 indicatorTypes 并保留合法项', () => {
  const normalized = normalizeGlobalSettings({
    indicatorTypes: ['文字型', '非法类型', '货币型']
  });

  assert.deepEqual(normalized.indicatorTypes, ['文字型', '货币型']);
});


test('applyPageDefaultsToGlobalSettings 在用户未配置时采用后台默认值', () => {
  const settings = applyPageDefaultsToGlobalSettings(null, {
    batchSize: 100,
    maxConcurrency: 5,
    maxRetries: 4
  });

  assert.equal(settings.batchSize, 100);
  assert.equal(settings.maxConcurrency, 5);
  assert.equal(settings.maxRetries, 4);
});

test('applyPageDefaultsToGlobalSettings 优先保留用户已保存的值', () => {
  const settings = applyPageDefaultsToGlobalSettings({
    batchSize: 50,
    maxConcurrency: 1,
    maxRetries: 2
  }, {
    batchSize: 100,
    maxConcurrency: 5,
    maxRetries: 4
  });

  assert.equal(settings.batchSize, 50);
  assert.equal(settings.maxConcurrency, 1);
  assert.equal(settings.maxRetries, 2);
});

test('applyPageDefaultsToGlobalSettings 只补充缺失字段', () => {
  const settings = applyPageDefaultsToGlobalSettings({
    batchSize: 50
  }, {
    batchSize: 100,
    maxConcurrency: 5,
    maxRetries: 4
  });

  assert.equal(settings.batchSize, 50);
  assert.equal(settings.maxConcurrency, 5);
  assert.equal(settings.maxRetries, 4);
});
