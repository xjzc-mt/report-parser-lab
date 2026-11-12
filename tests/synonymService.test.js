import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateFieldSimilarity,
  loadConversions,
  loadSynonyms
} from '../src/services/synonymService.js';

test('calculateFieldSimilarity 在存在单位换算规则时将数值型视为相等', () => {
  loadSynonyms([]);
  loadConversions([
    { raw_unit: '吨', standard_unit: '千吨', unit_conversion: 0.001 },
    { raw_unit: '千吨', standard_unit: '吨', unit_conversion: 1000 }
  ]);

  assert.equal(
    calculateFieldSimilarity('8460000', '8460', 'numeric', false, null, {
      leftUnit: '吨',
      rightUnit: '千吨'
    }),
    100
  );

  assert.equal(
    calculateFieldSimilarity('8460000', '8460', 'numeric', false, null, {
      leftUnit: '吨',
      rightUnit: '万吨'
    }),
    0
  );
});

test('calculateFieldSimilarity 会忽略常见的数值分组格式符号', () => {
  loadSynonyms([]);
  loadConversions([]);

  assert.equal(calculateFieldSimilarity('4,056,273', '4056273', 'numeric'), 100);
  assert.equal(calculateFieldSimilarity('4，056，273', '4056273', 'numeric'), 100);
  assert.equal(calculateFieldSimilarity('4 056 273', '4056273', 'numeric'), 100);
  assert.equal(calculateFieldSimilarity('4\u00A0056\u00A0273', '4056273', 'numeric'), 100);
});

test('calculateFieldSimilarity 会识别括号中的单位简称别名', () => {
  loadConversions([]);
  loadSynonyms([
    { term1: '吉焦', term2: '千兆焦耳(GJ)' }
  ]);

  assert.equal(calculateFieldSimilarity('吉焦', 'GJ', 'exact'), 100);
  assert.equal(
    calculateFieldSimilarity('4,056,273', '4056273', 'numeric', false, null, {
      leftUnit: '吉焦',
      rightUnit: 'GJ'
    }),
    100
  );
});

test('V1：数值型保留 0，且单位不一致不能被字符串相等绕过', () => {
  loadConversions([
    { raw_unit: '吨', standard_unit: '千吨', unit_conversion: 0.001 },
    { raw_unit: '千吨', standard_unit: '吨', unit_conversion: 1000 }
  ]);
  assert.equal(calculateFieldSimilarity(0, '0.00', 'numeric', false, null, { leftUnit: '吨', rightUnit: '吨' }), 100);
  assert.equal(calculateFieldSimilarity('1', '1', 'numeric', false, null, { leftUnit: '吨', rightUnit: '千吨' }), 0);
  assert.equal(calculateFieldSimilarity('1000', '1', 'numeric', false, null, { leftUnit: '吨', rightUnit: '千吨' }), 100);
});

test('V1：区间或混合文本不能被数值前缀截断为相等', () => {
  assert.equal(calculateFieldSimilarity('100', '100-200', 'numeric'), 0);
  assert.equal(calculateFieldSimilarity('100', '100吨', 'numeric'), 0);
});
