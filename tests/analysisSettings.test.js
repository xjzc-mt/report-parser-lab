import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeThresholdInput } from '../src/utils/analysisSettings.js';

test('相似度阈值 0 和 100 都保留，非法值回退', () => {
  assert.equal(normalizeThresholdInput(0), 0);
  assert.equal(normalizeThresholdInput('0'), 0);
  assert.equal(normalizeThresholdInput(100), 100);
  assert.equal(normalizeThresholdInput('100'), 100);
  assert.equal(normalizeThresholdInput('abc'), 70);
});
