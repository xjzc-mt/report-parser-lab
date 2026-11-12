import test from 'node:test';
import assert from 'node:assert/strict';

import { countFoundInputIndicators, mergeExtractionFileStats } from '../src/utils/extractionStats.js';

const empty = {
  totalInputIndicators: 0,
  totalIndicators: 0,
  totalBatches: 0,
  textCount: 0,
  numericCount: 0,
  intensityCount: 0,
  currencyCount: 0,
  textBatches: 0,
  numericBatches: 0,
  intensityBatches: 0,
  currencyBatches: 0,
  startedBatches: 0,
  completedBatches: 0,
  startedIndicators: 0,
  completedIndicators: 0,
  foundIndicators: 0,
  failedBatches: 0,
  failedIndicators: 0,
  pdfTextFallbacks: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCost: 0,
  failedFiles: 0
};

function fileStats(overrides = {}) {
  return {
    totalInputIndicators: 81,
    totalIndicators: 81,
    totalBatches: 3,
    textCount: 0,
    numericCount: 81,
    intensityCount: 0,
    currencyCount: 0,
    textBatches: 0,
    numericBatches: 3,
    intensityBatches: 0,
    currencyBatches: 0,
    startedBatches: 1,
    completedBatches: 1,
    startedIndicators: 40,
    completedIndicators: 40,
    foundIndicators: 40,
    failedBatches: 0,
    failedIndicators: 0,
    pdfTextFallbacks: 0,
    totalInputTokens: 10,
    totalOutputTokens: 5,
    totalCost: 0.01,
    failedFiles: 0,
    ...overrides
  };
}

test('两份 PDF 的计划量包含尚未开始的文件', () => {
  const first = mergeExtractionFileStats(empty, fileStats(), 2, false);
  assert.equal(first.stats.totalIndicators, 162);
  assert.equal(first.stats.totalBatches, 6);
  assert.equal(first.stats.startedIndicators, 40);
  assert.equal(first.stats.unstartedIndicators, 122);
  assert.equal(first.stats.executedBatches, 1);
});

test('第二份文件返回后不重复乘计划量，只累加执行统计', () => {
  const first = mergeExtractionFileStats(empty, fileStats(), 2, false);
  const second = mergeExtractionFileStats(first.stats, fileStats({
    startedIndicators: 81,
    completedIndicators: 81,
    foundIndicators: 81,
    startedBatches: 3,
    completedBatches: 3
  }), 2, true);

  assert.equal(second.stats.totalIndicators, 162);
  assert.equal(second.stats.totalBatches, 6);
  assert.equal(second.stats.startedIndicators, 121);
  assert.equal(second.stats.completedIndicators, 121);
  assert.equal(second.stats.unstartedIndicators, 41);
  assert.equal(second.stats.executedBatches, 4);
});

test('多年份结果按输入指标去重，不把 80 行算成 80 个指标', () => {
  const batch = Array.from({ length: 40 }, (_, index) => ({ indicator_code: `E${index}` }));
  const results = batch.flatMap((item) => [
    { indicator_code: item.indicator_code, year: 2023, value_type: '数值型', num_value: '1' },
    { indicator_code: item.indicator_code, year: 2024, value_type: '数值型', num_value: '2' }
  ]);
  assert.equal(results.length, 80);
  assert.equal(countFoundInputIndicators(batch, results), 40);
});

test('H1：结果表判定的缺失值不能计为已找到', () => {
  const missingValues = ['N/A', 'NA', '-', '无', '未提及', '未找到', '未披露'];
  const results = missingValues.map((value, index) => ({
    indicator_code: `E${index + 1}`,
    value_type: '文字型',
    text_value: value,
    num_value: ''
  }));
  const batch = missingValues.map((_, index) => ({ indicator_code: `E${index + 1}` }));

  assert.equal(countFoundInputIndicators(batch, results), 0);
});

test('H1：同一指标多个年份有效结果只计一个已找到指标', () => {
  const batch = [{ indicator_code: 'E1' }];
  const results = [
    { indicator_code: 'E1', value_type: '数值型', num_value: '1' },
    { indicator_code: 'E1', value_type: '数值型', num_value: '2' }
  ];

  assert.equal(countFoundInputIndicators(batch, results), 1);
});
