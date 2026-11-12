import test from 'node:test';
import assert from 'node:assert/strict';

import { buildValidationCoverage, normalizeValidationCoverage } from '../src/utils/validationCoverage.js';

function testRow(code, extras = {}) {
  return {
    report_name: '合成报告A',
    indicator_code: code,
    indicator_name: code,
    data_year: '2024',
    test_item_key: `合成报告A|||${code}|||2024`,
    ...extras
  };
}

test('W2：重复输出只按测试项计分母，模型结果单独计行数', () => {
  const coverage = buildValidationCoverage(
    [testRow('E1'), testRow('E2')],
    [
      testRow('E1', { match_status: '多结果' }),
      testRow('E1', { match_status: '多结果' }),
      testRow('E2', { match_status: '已匹配' })
    ],
    []
  );
  assert.equal(coverage.testItemCount, 2);
  assert.equal(coverage.validTestItemCount, 2);
  assert.equal(coverage.modelResultRowCount, 3);
  assert.equal(coverage.duplicateOutputRowCount, 2);
});

test('W2：无效年份按测试项统计，幻觉不混入测试项分母', () => {
  const coverage = buildValidationCoverage(
    [testRow('E1'), testRow('E2')],
    [testRow('E1', { match_status: '已匹配' })],
    [testRow('E2', { match_status: '未匹配', invalid_reason: '年份格式错误' })]
  );
  assert.equal(coverage.testItemCount, 2);
  assert.equal(coverage.validTestItemCount, 1);
  assert.equal(coverage.excludedTestItemCount, 1);
});

test('W2：全部年份无效时仍能给出 0/总数和模型结果 0', () => {
  const coverage = buildValidationCoverage(
    [testRow('E1'), testRow('E2')],
    [],
    [
      testRow('E1', { match_status: '未匹配', invalid_reason: '年份格式错误' }),
      testRow('E2', { match_status: '未匹配', invalid_reason: '年份格式错误' })
    ]
  );
  assert.equal(coverage.validTestItemCount, 0);
  assert.equal(coverage.testItemCount, 2);
  assert.equal(coverage.excludedTestItemCount, 2);
  assert.equal(coverage.modelResultRowCount, 0);
});

test('W2：幻觉输出计入模型结果，但不计入测试项分母', () => {
  const hallucination = {
    report_name: '额外报告B',
    indicator_code: 'HX',
    indicator_name: '额外指标',
    data_year: '2024',
    match_status: '幻觉',
    llm_indicator_name: '额外指标',
    llm_text_value: '额外内容'
  };
  const coverage = buildValidationCoverage(
    [testRow('E1')],
    [testRow('E1', { match_status: '已匹配' }), hallucination],
    []
  );
  assert.equal(coverage.testItemCount, 1);
  assert.equal(coverage.validTestItemCount, 1);
  assert.equal(coverage.modelResultRowCount, 2);
  assert.equal(coverage.hallucinationRowCount, 1);
});

test('W2：旧缓存有比较行时重建测试项，不把 validCount 当测试项数', () => {
  const savedRows = [
    testRow('E1', { match_status: '多结果' }),
    testRow('E1', { match_status: '多结果' }),
    testRow('E2', { match_status: '已匹配' })
  ];
  const normalized = normalizeValidationCoverage({
    rawCount: 2,
    validCount: 3,
    invalidCount: 0,
    invalidRows: []
  }, savedRows);
  assert.equal(normalized.testItemCount, 2);
  assert.equal(normalized.validTestItemCount, 2);
  assert.equal(normalized.modelResultRowCount, 3);
  assert.equal(normalized.duplicateOutputRowCount, 2);
});

test('W2：旧缓存没有可重建的行时明确要求重新分析', () => {
  const normalized = normalizeValidationCoverage({ rawCount: 2, validCount: 1, invalidCount: 1, invalidRows: [] });
  assert.equal(normalized.needsReanalysis, true);
  assert.equal(normalized.testItemCount, undefined);
});
