import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY,
  LS_TEST_SET_WORKBENCH_SUBTAB,
  mapLegacyTestSetModeToSubtabKey,
  normalizeTestSetWorkbenchSubtabKey
} from '../src/utils/testSetWorkbenchSettings.js';
import { TEST_SET_SUBTABS } from '../src/constants/labNavigation.js';

test('DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY 指向 prompt-iteration', () => {
  assert.equal(DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY, 'prompt-iteration');
});

test('mapLegacyTestSetModeToSubtabKey 兼容旧流程模式值', () => {
  assert.equal(mapLegacyTestSetModeToSubtabKey('full'), 'prompt-iteration');
  assert.equal(mapLegacyTestSetModeToSubtabKey('validation'), 'model-validation');
  assert.equal(mapLegacyTestSetModeToSubtabKey('optimization'), 'prompt-optimization');
});

test('mapLegacyTestSetModeToSubtabKey 对非法值回退默认子页', () => {
  assert.equal(mapLegacyTestSetModeToSubtabKey('unknown'), 'prompt-iteration');
  assert.equal(mapLegacyTestSetModeToSubtabKey(''), 'prompt-iteration');
  assert.equal(mapLegacyTestSetModeToSubtabKey(null), 'prompt-iteration');
});

test('normalizeTestSetWorkbenchSubtabKey 只接受合法子页 key', () => {
  const validKeys = TEST_SET_SUBTABS.map((tab) => tab.key);
  validKeys.forEach((key) => {
    assert.equal(normalizeTestSetWorkbenchSubtabKey(key), key);
  });
  assert.equal(normalizeTestSetWorkbenchSubtabKey('invalid'), 'prompt-iteration');
});

test('LS_TEST_SET_WORKBENCH_SUBTAB 暴露测试集二级页持久化 key', () => {
  assert.equal(LS_TEST_SET_WORKBENCH_SUBTAB, 'llm_lab_test_set_subtab');
});
