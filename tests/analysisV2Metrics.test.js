import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAnalysisV2Model, normalizeAnalysisValueType, normalizeDetailValueType } from '../src/utils/analysisV2Metrics.js';

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

test('buildAnalysisV2Model 按新验收口径聚合核心指标', () => {
  const rows = [
    makeBaseRow({ report_name: '报告A', indicator_code: 'T1', indicator_name: '文本指标', value_type_1: '文字型', similarity: 100, match_status: '已匹配' }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 90, match_status: '多结果', llm_num_value: '100' }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 40, match_status: '多结果', llm_num_value: '110' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'I2', indicator_name: '强度指标', data_year: '2023', value_type_1: '强度型', similarity: 60, match_status: '多结果', llm_num_value: '1.1' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'I2', indicator_name: '强度指标', data_year: '2023', value_type_1: '强度型', similarity: 20, match_status: '多结果', llm_num_value: '1.2' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'N2', indicator_name: '数值指标', data_year: '2023', value_type_1: '数值型', similarity: 0, match_status: '未匹配', llm_text_value: '', llm_num_value: '' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'T2', indicator_name: '文本指标2', data_year: '2023', value_type_1: '文字型', similarity: 40, match_status: '已匹配' }),
    makeBaseRow({ report_name: '报告C', indicator_code: 'T3', indicator_name: '文本指标3', data_year: '2024', value_type_1: '文字型', similarity: 80, match_status: '已匹配' }),
    makeBaseRow({ report_name: '报告C', indicator_code: 'HX', indicator_name: '幻觉指标', data_year: '2024', value_type_1: '数值型', similarity: 0, match_status: '幻觉', llm_num_value: '999' })
  ];

  const model = buildAnalysisV2Model(rows, 70);

  assert.equal(model.summary.testItemCount, 6);
  assert.equal(model.summary.modelOutputCount, 8);
  assert.equal(model.summary.strictPassCount, 2);
  assert.equal(model.summary.lenientPassCount, 3);
  assert.equal(model.summary.hitCount, 5);
  assert.equal(model.summary.duplicateCount, 2);
  assert.equal(model.summary.missCount, 1);
  assert.equal(model.summary.hallucinationCount, 1);
  assert.equal(model.summary.strictPassRate, 2 / 6);
  assert.equal(model.summary.lenientPassRate, 3 / 6);
  assert.equal(model.summary.recall, 5 / 6);
  assert.equal(model.summary.precision, 3 / 8);
  assert.equal(model.summary.duplicateRate, 2 / 6);
  assert.equal(model.summary.missRate, 1 / 6);
  assert.equal(model.summary.hallucinationRate, 1 / 8);
  assert.equal(model.summary.averageBestSimilarity, 62);
  assert.deepEqual(model.summary.categoryBreakdown, {
    perfect_match: 1,
    pass_match: 1,
    single_fail: 1,
    duplicate_with_pass: 1,
    duplicate_without_pass: 1,
    miss: 1,
    hallucination: 1
  });

  assert.equal(model.testItems.find((item) => item.key === '报告A|||T1|||2024').category, 'perfect_match');
  assert.equal(model.testItems.find((item) => item.key === '报告C|||T3|||2024').category, 'pass_match');
  assert.equal(model.testItems.find((item) => item.key === '报告A|||N1|||2024').category, 'duplicate_with_pass');
  assert.equal(model.testItems.find((item) => item.key === '报告B|||I2|||2023').category, 'duplicate_without_pass');
});

test('buildAnalysisV2Model 生成跨报告概览并将货币型并入数值型', () => {
  const rows = [
    makeBaseRow({ report_name: '报告A', indicator_code: 'T1', indicator_name: '文本指标', value_type_1: '文字型', similarity: 80 }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 90, match_status: '多结果', llm_num_value: '100' }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 40, match_status: '多结果', llm_num_value: '101' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'N2', indicator_name: '数值指标', value_type_1: '数值型', similarity: 0, match_status: '未匹配', llm_text_value: '', llm_num_value: '' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'I1', indicator_name: '强度指标', value_type_1: '强度型', data_year: '2023', similarity: 60, match_status: '多结果', llm_num_value: '1.1' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'I1', indicator_name: '强度指标', value_type_1: '强度型', data_year: '2023', similarity: 20, match_status: '多结果', llm_num_value: '1.2' })
  ];

  const model = buildAnalysisV2Model(rows, 70);
  const numericGroup = model.overviews.byType.find((group) => group.key === '数值型');
  const allReports = model.overviews.byReport.find((group) => group.key === '全部报告');
  const reportA = model.overviews.byReport.find((group) => group.key === '报告A');
  const reportTypeCell = model.overviews.reportTypeMatrix.find((cell) => cell.reportName === '报告A' && cell.valueType === '数值型');
  const overallTypeCell = model.overviews.reportTypeMatrix.find((cell) => cell.reportName === '全部报告' && cell.valueType === '数值型');
  const allIndicators = model.overviews.byIndicator.find((group) => group.key === '全部指标');
  const indicatorTypeCell = model.overviews.indicatorTypeMatrix.find((cell) => cell.indicatorLabel === '全部指标' && cell.valueType === '数值型');

  assert.equal(numericGroup.summary.testItemCount, 2);
  assert.equal(numericGroup.summary.lenientPassRate, 0.5);
  assert.equal(numericGroup.summary.duplicateRate, 0.5);
  assert.equal(allReports.summary.testItemCount, 4);
  assert.equal(reportA.summary.testItemCount, 2);
  assert.equal(reportA.summary.lenientPassRate, 1);
  assert.equal(reportTypeCell.summary.testItemCount, 1);
  assert.equal(reportTypeCell.summary.lenientPassRate, 1);
  assert.equal(overallTypeCell.summary.testItemCount, 2);
  assert.equal(allIndicators.summary.testItemCount, 4);
  assert.equal(indicatorTypeCell.summary.testItemCount, 2);
});

test('normalize value type helpers 正确识别英文强度型与货币型', () => {
  assert.equal(normalizeAnalysisValueType('INTENSITY'), '强度型');
  assert.equal(normalizeDetailValueType('INTENSITY'), '强度型');
  assert.equal(normalizeAnalysisValueType('CURRENCY'), '数值型');
  assert.equal(normalizeDetailValueType('CURRENCY'), '货币型');
});

test('buildAnalysisV2Model 在无输出时将精确率和幻觉率记为 0', () => {
  const rows = [
    makeBaseRow({ report_name: '报告A', indicator_code: 'M1', indicator_name: '漏摘指标', value_type_1: '文字型', similarity: 0, match_status: '未匹配', llm_text_value: '' })
  ];

  const model = buildAnalysisV2Model(rows, 70);

  assert.equal(model.summary.modelOutputCount, 0);
  assert.equal(model.summary.precision, 0);
  assert.equal(model.summary.hallucinationRate, 0);
});

test('V4：自定义关联的测试项身份优先于展示字段，公告 A/B 不被合并', () => {
  const rows = [
    makeBaseRow({
      report_name: '合成报告A',
      indicator_code: 'E1',
      indicator_name: '合成指标',
      data_year: '2024',
      test_item_key: 'A|||E1|||2024',
      similarity: 100,
      match_status: '已匹配'
    }),
    makeBaseRow({
      report_name: '合成报告A',
      indicator_code: 'E1',
      indicator_name: '合成指标',
      data_year: '2024',
      test_item_key: 'B|||E1|||2024',
      similarity: 100,
      match_status: '已匹配'
    })
  ];

  const model = buildAnalysisV2Model(rows, 70);
  assert.equal(model.summary.testItemCount, 2);
  assert.equal(model.summary.strictPassCount, 2);
  assert.equal(model.summary.duplicateCount, 0);
});

test('V4：同一关联身份的多条输出仍按重复项统计', () => {
  const rows = [
    makeBaseRow({ test_item_key: 'A|||E1|||2024', similarity: 100, match_status: '多结果' }),
    makeBaseRow({ test_item_key: 'A|||E1|||2024', similarity: 80, match_status: '多结果' })
  ];

  const model = buildAnalysisV2Model(rows, 70);
  assert.equal(model.summary.testItemCount, 1);
  assert.equal(model.summary.duplicateCount, 1);
});
