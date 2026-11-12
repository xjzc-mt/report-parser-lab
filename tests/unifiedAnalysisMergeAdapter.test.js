import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMergedTreeData, buildPathFilters } from '../src/utils/unifiedAnalysisMergeAdapter.js';
import { buildAnalysisPanelExportPayload } from '../src/utils/unifiedAnalysisPanel.js';

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

test('buildMergedTreeData 构建旧版树结构所需的三个根节点与新版指标', () => {
  const rows = [
    makeBaseRow({ report_name: '报告A', indicator_code: 'T1', indicator_name: '文本指标', value_type_1: '文字型', similarity: 100 }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 90, match_status: '多结果', llm_num_value: '100' }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 40, match_status: '多结果', llm_num_value: '101' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'I1', indicator_name: '强度指标', value_type_1: '强度型', data_year: '2023', similarity: 60, match_status: '多结果', llm_num_value: '1.1' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'I1', indicator_name: '强度指标', value_type_1: '强度型', data_year: '2023', similarity: 20, match_status: '多结果', llm_num_value: '1.2' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'T2', indicator_name: '文本指标2', data_year: '2023', value_type_1: '文字型', similarity: 40 }),
    makeBaseRow({ report_name: '报告C', indicator_code: 'T3', indicator_name: '文本指标3', data_year: '2024', value_type_1: '文字型', similarity: 80 }),
    makeBaseRow({ report_name: '报告C', indicator_code: 'HX', indicator_name: '幻觉指标', data_year: '2024', value_type_1: '数值型', similarity: 0, match_status: '幻觉', llm_num_value: '999' })
  ];

  const tree = buildMergedTreeData(rows, 70);

  assert.equal(tree.crossReportRoot.label, '全部报告');
  assert.equal(tree.perReportRoot.label, '全部指标');
  assert.equal(tree.perTypeRoot.label, '全部指标');
  assert.equal(tree.crossReportRoot.metrics.testItemCount, 5);
  assert.equal(tree.crossReportRoot.metrics.lenientPassRate, 3 / 5);
  assert.deepEqual(tree.crossReportRoot.metrics.categoryBreakdown, {
    perfect_match: 1,
    pass_match: 1,
    single_fail: 1,
    duplicate_with_pass: 1,
    duplicate_without_pass: 1,
    miss: 0,
    hallucination: 1
  });

  const textTypeNode = tree.crossReportRoot.children.find((node) => node.label === '文字型');
  const reportNode = tree.perReportRoot.children.find((node) => node.label === '报告A');
  const indicatorNode = reportNode.children.find((node) => node.label === '数值型').children[0];

  assert.equal(textTypeNode.metrics.testItemCount, 3);
  assert.equal(reportNode.metrics.testItemCount, 2);
  assert.equal(indicatorNode.filters.indicators[0], 'N1 货币指标');
});

test('buildPathFilters 根据树路径自动拼装明细筛选条件', () => {
  const path = [
    { filters: { reportNames: ['报告A'] } },
    { filters: { valueTypes: ['数值型'] } },
    { filters: { indicators: ['N1 货币指标'] } }
  ];

  assert.deepEqual(buildPathFilters(path), {
    reportNames: ['报告A'],
    indicators: ['N1 货币指标'],
    valueTypes: ['数值型'],
    outputCounts: [],
    similarities: [],
    categories: []
  });
});

function makeTestItemRow(overrides = {}) {
  return {
    report_name: '合成报告A',
    indicator_code: 'E1',
    indicator_name: '合成指标',
    data_year: '2024',
    value_type_1: '数值型',
    match_status: '已匹配',
    similarity: 100,
    llm_based_similarity: 100,
    llm_num_value: '42',
    ...overrides
  };
}

function makeHallucinationRow(overrides = {}) {
  return {
    report_name: '额外报告B',
    indicator_code: 'HX',
    indicator_name: '额外文本指标',
    llm_indicator_name: '额外文本指标',
    data_year: '2024',
    value_type: 'TEXT',
    value_type_1: '文字型',
    match_status: '幻觉',
    llm_text_value: '额外内容',
    llm_num_value: '',
    ...overrides
  };
}

test('V6：仅幻觉报告、类型和指标进入分组并可导出', () => {
  const rows = [makeTestItemRow(), makeHallucinationRow()];
  const tree = buildMergedTreeData(rows, 70, true);

  const textTypeNode = tree.crossReportRoot.children.find((node) => node.label === '文字型');
  assert.ok(textTypeNode, '跨报告视图应包含仅幻觉的文字型分组');
  assert.equal(textTypeNode.hallucinations.length, 1);
  assert.ok(textTypeNode.children.some((node) => node.label.includes('HX') && node.hallucinations.length === 1));

  const reportBNode = tree.perReportRoot.children.find((node) => node.label === '额外报告B');
  assert.ok(reportBNode, '报告视图应包含仅幻觉报告');
  assert.equal(reportBNode.metrics.modelOutputCount, 1);
  assert.equal(reportBNode.metrics.hallucinationRate, 1);

  const exported = buildAnalysisPanelExportPayload(reportBNode);
  assert.equal(exported.rows.length, 1);
  assert.equal(exported.rows[0].输出项, 1);
  assert.equal(exported.rows[0].幻觉率, '100%');
});

test('V6：关闭幻觉统计后不生成仅幻觉分组', () => {
  const rows = [makeTestItemRow(), makeHallucinationRow()];
  const tree = buildMergedTreeData(rows, 70, false);

  assert.equal(tree.crossReportRoot.children.some((node) => node.label === '文字型'), false);
  assert.equal(tree.perReportRoot.children.some((node) => node.label === '额外报告B'), false);
});
