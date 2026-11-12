import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_VALIDATION_FIELD_MAPPINGS,
  resolveValidationFieldMappings,
  extractFieldOptionsFromRows,
  validateValidationFieldMappings,
  buildRowJoinKey
} from '../src/utils/validationFieldMappings.js';

test('resolveValidationFieldMappings 在空配置时回退默认映射', () => {
  assert.deepEqual(resolveValidationFieldMappings([]), DEFAULT_VALIDATION_FIELD_MAPPINGS);
});

test('extractFieldOptionsFromRows 只提取首行字段名', () => {
  assert.deepEqual(
    extractFieldOptionsFromRows([{ report_name: '报告A', custom_code: 'A-1' }]),
    ['report_name', 'custom_code']
  );
});

test('validateValidationFieldMappings 会拦截重复字段与不存在字段', () => {
  const result = validateValidationFieldMappings({
    mappings: [
      { llmField: 'report_name', testField: 'report_name' },
      { llmField: 'report_name', testField: 'data_year' }
    ],
    llmFields: ['report_name', 'indicator_code', 'year'],
    testFields: ['report_name', 'indicator_code', 'data_year']
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /LLM 字段 "report_name" 被重复使用/);
});

test('buildRowJoinKey 按映射字段顺序生成 join key', () => {
  const mappings = [
    { llmField: 'report_name', testField: 'report_name' },
    { llmField: 'custom_indicator', testField: 'indicator_code' }
  ];

  assert.equal(
    buildRowJoinKey({ report_name: '报告A', custom_indicator: 'E1' }, mappings, 'llm'),
    '报告A|||E1'
  );
});
