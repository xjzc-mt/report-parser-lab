import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUICK_VALIDATION_THRESHOLD,
  LS_QUICK_VALIDATION_INCLUDE_HALLUCINATION,
  LS_QUICK_VALIDATION_THRESHOLD,
  loadQuickValidationIncludeHallucination,
  loadQuickValidationThreshold,
  normalizeQuickValidationIncludeHallucination,
  normalizeQuickValidationThreshold,
  saveQuickValidationIncludeHallucination,
  saveQuickValidationThreshold
} from '../src/utils/quickValidationSettings.js';

test('normalizeQuickValidationThreshold 会裁剪到 0-100 并回退默认值', () => {
  assert.equal(normalizeQuickValidationThreshold(85), 85);
  assert.equal(normalizeQuickValidationThreshold(999), 100);
  assert.equal(normalizeQuickValidationThreshold(-12), 0);
  assert.equal(normalizeQuickValidationThreshold('abc'), DEFAULT_QUICK_VALIDATION_THRESHOLD);
});

test('load/saveQuickValidationThreshold 会持久化模型结果验收阈值', () => {
  const storage = {
    data: new Map(),
    getItem(key) {
      return this.data.has(key) ? this.data.get(key) : null;
    },
    setItem(key, value) {
      this.data.set(key, value);
    }
  };

  assert.equal(loadQuickValidationThreshold(storage), DEFAULT_QUICK_VALIDATION_THRESHOLD);
  assert.equal(saveQuickValidationThreshold(88, storage), 88);
  assert.equal(storage.getItem(LS_QUICK_VALIDATION_THRESHOLD), '88');
  assert.equal(loadQuickValidationThreshold(storage), 88);
});

test('幻觉统计开关会持久化并兼容字符串布尔值', () => {
  const storage = {
    data: new Map(),
    getItem(key) {
      return this.data.has(key) ? this.data.get(key) : null;
    },
    setItem(key, value) {
      this.data.set(key, value);
    }
  };

  assert.equal(loadQuickValidationIncludeHallucination(storage), true);
  assert.equal(saveQuickValidationIncludeHallucination(false, storage), false);
  assert.equal(storage.getItem(LS_QUICK_VALIDATION_INCLUDE_HALLUCINATION), 'false');
  assert.equal(loadQuickValidationIncludeHallucination(storage), false);
  assert.equal(normalizeQuickValidationIncludeHallucination('off'), false);
  assert.equal(normalizeQuickValidationIncludeHallucination('1'), true);
});
