import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAnalysisV2Index,
  buildAnalysisV2Model,
  getAnalysisSubsetFromIndex
} from '../src/utils/analysisV2Metrics.js';

function makeBaseRow(overrides = {}) {
  return {
    report_name: '报告A',
    indicator_code: 'I1',
    indicator_name: '指标1',
    data_year: '2024',
    value_type_1: '文字型',
    match_status: '已匹配',
    similarity: 80,
    llm_based_similarity: 0,
    llm_text_value: '值',
    llm_num_value: '',
    ...overrides
  };
}

test('buildAnalysisV2Index 预聚合年份与基础测试项，供后续筛选复用', () => {
  const rows = [
    makeBaseRow({ report_name: '报告A', indicator_code: 'T1', indicator_name: '文本指标', data_year: '2024', similarity: 100 }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'N1', indicator_name: '数值指标', data_year: '2023', value_type_1: '数值型', similarity: 90, match_status: '多结果', llm_num_value: '1' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'N1', indicator_name: '数值指标', data_year: '2023', value_type_1: '数值型', similarity: 10, match_status: '多结果', llm_num_value: '2' }),
    makeBaseRow({ report_name: '报告C', indicator_code: 'HX', indicator_name: '幻觉指标', data_year: '2022', value_type_1: '文字型', match_status: '幻觉', similarity: 0, llm_text_value: '幻觉值' })
  ];

  const index = buildAnalysisV2Index(rows);

  assert.deepEqual(index.allYears, ['2022', '2023', '2024']);
  assert.equal(index.baseItems.length, 2);
  assert.equal(index.hallucinations.length, 1);
  assert.equal(index.itemsByYear.get('2024').length, 1);
  assert.equal(index.itemsByYear.get('2023').length, 1);
  assert.equal(index.hallucinationsByYear.get('2022').length, 1);
});

test('getAnalysisSubsetFromIndex 按年份返回测试项与幻觉子集', () => {
  const rows = [
    makeBaseRow({ report_name: '报告A', indicator_code: 'T1', indicator_name: '文本指标', data_year: '2024', similarity: 100 }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'N1', indicator_name: '数值指标', data_year: '2023', value_type_1: '数值型', similarity: 90, match_status: '多结果', llm_num_value: '1' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'N1', indicator_name: '数值指标', data_year: '2023', value_type_1: '数值型', similarity: 10, match_status: '多结果', llm_num_value: '2' }),
    makeBaseRow({ report_name: '报告C', indicator_code: 'HX', indicator_name: '幻觉指标', data_year: '2024', value_type_1: '数值型', match_status: '幻觉', similarity: 0, llm_num_value: '999' }),
    makeBaseRow({ report_name: '报告D', indicator_code: 'UNK', indicator_name: '无年份指标', data_year: '', value_type_1: '文字型', similarity: 50 })
  ];

  const index = buildAnalysisV2Index(rows);
  const subset2024 = getAnalysisSubsetFromIndex(index, ['2024']);
  const subset2023 = getAnalysisSubsetFromIndex(index, ['2023']);

  assert.equal(subset2024.baseItems.length, 2);
  assert.equal(subset2024.hallucinations.length, 1);
  assert.deepEqual(new Set(subset2024.baseItems.map((item) => item.reportName)), new Set(['报告A', '报告D']));

  assert.equal(subset2023.baseItems.length, 2);
  assert.equal(subset2023.hallucinations.length, 0);
  assert.deepEqual(new Set(subset2023.baseItems.map((item) => item.reportName)), new Set(['报告B', '报告D']));
});

test('buildAnalysisV2Model 支持直接复用预构建索引，不改变统计口径', () => {
  const rows = [
    makeBaseRow({ report_name: '报告A', indicator_code: 'T1', indicator_name: '文本指标', value_type_1: '文字型', similarity: 100, match_status: '已匹配' }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 90, match_status: '多结果', llm_num_value: '100' }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 40, match_status: '多结果', llm_num_value: '110' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'HX', indicator_name: '幻觉指标', data_year: '2024', value_type_1: '数值型', similarity: 0, match_status: '幻觉', llm_num_value: '999' })
  ];

  const directModel = buildAnalysisV2Model(rows, 70);
  const indexedModel = buildAnalysisV2Model(buildAnalysisV2Index(rows), 70);

  assert.deepEqual(indexedModel.summary, directModel.summary);
  assert.equal(indexedModel.testItems.length, directModel.testItems.length);
  assert.equal(indexedModel.overviews.byReport.length, directModel.overviews.byReport.length);
});
