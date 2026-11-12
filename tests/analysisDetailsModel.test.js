import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDetailRowModels,
  applyDetailFilters,
  buildDetailColumnOptions,
  getDetailRowHeight,
  getFieldsForRows,
  buildVirtualLayout,
  getVirtualWindow,
  getNextDetailSortState,
  sortDetailRows
} from '../src/utils/analysisDetailsModel.js';

function makeItem(overrides = {}) {
  return {
    key: '报告A|||I1|||2024',
    reportName: '报告A',
    indicatorCode: 'I1',
    indicatorName: '指标1',
    indicatorLabel: 'I1 指标1',
    rawValueType: '文字型',
    outputCount: 1,
    bestSimilarity: 88,
    category: 'pass_match',
    rows: [{ pdf_numbers: '10', text_value: '测试集文本' }],
    bestRow: { llm_pdf_numbers: '10', llm_text_value: '模型文本' },
    ...overrides
  };
}

test('buildDetailRowModels 生成轻量行模型而不是预先展开整块详情字段', () => {
  const rows = buildDetailRowModels(
    [
      makeItem(),
      makeItem({
        key: '报告B|||N1|||2023',
        reportName: '报告B',
        indicatorCode: 'N1',
        indicatorName: '数值指标',
        indicatorLabel: 'N1 数值指标',
        rawValueType: '数值型',
        outputCount: 2,
        bestSimilarity: 61,
        category: 'duplicate_without_pass',
        rows: [{ pdf_numbers: '12', num_value: '100', unit: '吨' }],
        bestRow: { llm_pdf_numbers: '12', llm_num_value: '90', llm_unit: '吨' }
      })
    ],
    [
      {
        report_name: '报告C',
        indicator_code: 'HX',
        indicator_name: '幻觉指标',
        llm_indicator_name: '幻觉指标',
        value_type_1: '文字型',
        llm_year: '2024',
        llm_pdf_numbers: '8',
        llm_text_value: '幻觉内容'
      }
    ]
  );

  assert.equal(rows.length, 3);
  assert.equal(rows[0].indicatorLabel, 'I1 指标1');
  assert.equal(rows[0].expectedFields, undefined);
  assert.equal(rows[0].actualFields, undefined);
  assert.equal(rows[2].categoryKey, 'hallucination');
});

test('getFieldsForRows 将文字型值限制为 12 行，供 tooltip 接管完整展示', () => {
  const fields = getFieldsForRows(
    { pdf_numbers: '10', text_value: '测试集长文本' },
    { llm_pdf_numbers: '10', llm_text_value: '模型长文本' },
    '文字型'
  );

  assert.equal(fields.expected[1].maxLines, 12);
  assert.equal(fields.actual[1].maxLines, 12);
  assert.equal(fields.expected[1].alwaysTooltip, true);
  assert.equal(fields.actual[1].alwaysTooltip, true);
});

test('applyDetailFilters 和 buildDetailColumnOptions 基于轻量模型工作', () => {
  const rows = buildDetailRowModels([
    makeItem(),
    makeItem({
      key: '报告B|||N1|||2023',
      reportName: '报告B',
      indicatorCode: 'N1',
      indicatorName: '数值指标',
      indicatorLabel: 'N1 数值指标',
      rawValueType: '数值型',
      outputCount: 2,
      bestSimilarity: 61,
      category: 'duplicate_without_pass',
      rows: [{ pdf_numbers: '12', num_value: '100', unit: '吨' }],
      bestRow: { llm_pdf_numbers: '12', llm_num_value: '90', llm_unit: '吨' }
    })
  ]);

  const options = buildDetailColumnOptions(rows);
  const filtered = applyDetailFilters(rows, {
    reportNames: ['报告B'],
    indicators: [],
    valueTypes: ['数值型'],
    outputCounts: ['2'],
    similarities: [],
    similarityRange: [0, 100],
    categories: ['重复摘录-无达标']
  });

  assert.deepEqual(options.reportNames, ['报告A', '报告B']);
  assert.deepEqual(options.outputCounts, ['1', '2']);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].reportName, '报告B');
});

test('applyDetailFilters 支持相似度区间筛选', () => {
  const rows = buildDetailRowModels([
    makeItem({ bestSimilarity: 95 }),
    makeItem({
      key: '报告B|||N1|||2023',
      reportName: '报告B',
      indicatorCode: 'N1',
      indicatorName: '数值指标',
      indicatorLabel: 'N1 数值指标',
      rawValueType: '数值型',
      outputCount: 2,
      bestSimilarity: 61,
      category: 'duplicate_without_pass',
      rows: [{ pdf_numbers: '12', num_value: '100', unit: '吨' }],
      bestRow: { llm_pdf_numbers: '12', llm_num_value: '90', llm_unit: '吨' }
    }),
    makeItem({
      key: '报告C|||N2|||2023',
      reportName: '报告C',
      indicatorCode: 'N2',
      indicatorName: '数值指标2',
      indicatorLabel: 'N2 数值指标2',
      rawValueType: '数值型',
      outputCount: 1,
      bestSimilarity: 42,
      category: 'single_fail',
      rows: [{ pdf_numbers: '13', num_value: '80', unit: '吨' }],
      bestRow: { llm_pdf_numbers: '13', llm_num_value: '70', llm_unit: '吨' }
    })
  ]);

  const filtered = applyDetailFilters(rows, {
    reportNames: [],
    indicators: [],
    valueTypes: [],
    outputCounts: [],
    similarities: [],
    similarityRange: [50, 100],
    categories: []
  });

  assert.deepEqual(filtered.map((row) => row.bestSimilarity), [95, 61]);
});

test('明细排序支持默认 未排序 升序 降序三态切换', () => {
  assert.deepEqual(getNextDetailSortState(null, 'bestSimilarity'), { key: 'bestSimilarity', direction: 'asc' });
  assert.deepEqual(getNextDetailSortState({ key: 'bestSimilarity', direction: 'asc' }, 'bestSimilarity'), { key: 'bestSimilarity', direction: 'desc' });
  assert.equal(getNextDetailSortState({ key: 'bestSimilarity', direction: 'desc' }, 'bestSimilarity'), null);
});

test('sortDetailRows 按相似度排序且默认保持原顺序', () => {
  const rows = buildDetailRowModels([
    makeItem({ key: 'A', bestSimilarity: 95 }),
    makeItem({ key: 'B', bestSimilarity: 61, reportName: '报告B' }),
    makeItem({ key: 'C', bestSimilarity: 42, reportName: '报告C' })
  ]);

  assert.deepEqual(sortDetailRows(rows, null).map((row) => row.key), ['A', 'B', 'C']);
  assert.deepEqual(
    sortDetailRows(rows, { key: 'bestSimilarity', direction: 'asc' }).map((row) => row.bestSimilarity),
    [42, 61, 95]
  );
  assert.deepEqual(
    sortDetailRows(rows, { key: 'bestSimilarity', direction: 'desc' }).map((row) => row.bestSimilarity),
    [95, 61, 42]
  );
});

test('getDetailRowHeight 按值类型返回固定高度档位', () => {
  assert.equal(getDetailRowHeight({ rawValueType: '文字型' }), 252);
  assert.equal(getDetailRowHeight({ rawValueType: '强度型' }), 156);
  assert.equal(getDetailRowHeight({ rawValueType: '数值型' }), 116);
  assert.equal(getDetailRowHeight({ rawValueType: '货币型' }), 132);
  assert.equal(getDetailRowHeight({ rawValueType: '数值型', expectedRow: { currency: 'CNY' } }), 132);
  assert.equal(getDetailRowHeight({ rawValueType: '数值型', actualRow: { llm_currency: 'USD' } }), 132);
});

test('getVirtualWindow 根据累计高度返回稳定的渲染窗口', () => {
  const layout = buildVirtualLayout([
    { rawValueType: '文字型' },
    { rawValueType: '数值型' },
    { rawValueType: '强度型' },
    { rawValueType: '货币型' },
    { rawValueType: '文字型' }
  ]);

  assert.deepEqual(layout.heights, [252, 116, 156, 132, 252]);
  assert.deepEqual(layout.offsets, [0, 252, 368, 524, 656]);

  assert.deepEqual(
    getVirtualWindow({ layout, viewportHeight: 320, scrollTop: 0, overscan: 1 }),
    { start: 0, end: 2, offsetTop: 0, offsetBottom: 384 }
  );

  assert.deepEqual(
    getVirtualWindow({ layout, viewportHeight: 320, scrollTop: 380, overscan: 1 }),
    { start: 1, end: 4, offsetTop: 252, offsetBottom: 0 }
  );
});
