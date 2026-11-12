import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_APP_TAB_KEY,
  DEFAULT_DATA_PREP_SUBTAB_KEY,
  LS_ACTIVE_APP_TAB,
  LS_DATA_PREP_SUBTAB,
  normalizeAppTabKey,
  normalizeDataPrepSubtabKey
} from '../src/utils/labNavigationState.js';

test('一级页持久化 key 和默认页稳定', () => {
  assert.equal(LS_ACTIVE_APP_TAB, 'llm_lab_active_tab');
  assert.equal(DEFAULT_APP_TAB_KEY, 'prompt-iteration');
});

test('normalizeAppTabKey 只接受合法一级页 key 并兼容旧版 test-workbench', () => {
  assert.equal(normalizeAppTabKey('prompt-iteration'), 'prompt-iteration');
  assert.equal(normalizeAppTabKey('model-validation'), 'model-validation');
  assert.equal(normalizeAppTabKey('prompt-optimization'), 'prompt-optimization');
  assert.equal(normalizeAppTabKey('online-validation'), 'online-validation');
  assert.equal(normalizeAppTabKey('data-prep'), 'data-prep');
  assert.equal(normalizeAppTabKey('docs'), 'docs');
  // 旧版本 test-workbench 映射为 prompt-iteration
  assert.equal(normalizeAppTabKey('test-workbench'), 'prompt-iteration');
  assert.equal(normalizeAppTabKey('invalid'), 'prompt-iteration');
  assert.equal(normalizeAppTabKey(''), 'prompt-iteration');
});

test('数据预处理二级页持久化 key 和默认页稳定', () => {
  assert.equal(LS_DATA_PREP_SUBTAB, 'llm_lab_data_prep_subtab');
  assert.equal(DEFAULT_DATA_PREP_SUBTAB_KEY, 'chunking');
});

test('normalizeDataPrepSubtabKey 只接受合法数据预处理子页 key', () => {
  assert.equal(normalizeDataPrepSubtabKey('chunking'), 'chunking');
  assert.equal(normalizeDataPrepSubtabKey('pdf-compress'), 'pdf-compress');
  assert.equal(normalizeDataPrepSubtabKey('token-estimation'), 'token-estimation');
  assert.equal(normalizeDataPrepSubtabKey('invalid'), 'chunking');
  assert.equal(normalizeDataPrepSubtabKey(null), 'chunking');
});
