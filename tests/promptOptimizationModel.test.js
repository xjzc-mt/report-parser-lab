import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPromptAsset,
  createPromptVersion,
  createOptimizationDataset,
  createOptimizationRun,
  summarizeOptimizationRun
} from '../src/utils/promptOptimizationModel.js';

const fixedDeps = {
  now: () => 1713955200000,
  createId: (prefix) => `${prefix}_fixed`
};

test('createPromptAsset 会裁剪名称并补全时间字段', () => {
  const asset = createPromptAsset({
    name: '  温室气体排放  ',
    targetName: '  排放总量  ',
    indicatorCode: '  E1  ',
    indicatorName: '  范围一排放  '
  }, fixedDeps);

  assert.equal(asset.id, 'passet_fixed');
  assert.equal(asset.name, '温室气体排放');
  assert.equal(asset.targetName, '排放总量');
  assert.equal(asset.indicatorCode, 'E1');
  assert.equal(asset.indicatorName, '范围一排放');
  assert.equal(asset.createdAt, 1713955200000);
  assert.equal(asset.updatedAt, 1713955200000);
});

test('createPromptVersion 会兼容旧 prompt 字段并裁剪空白', () => {
  const version = createPromptVersion({
    assetId: 'asset_1',
    label: '  第一版  ',
    prompt: '  只返回 JSON  '
  }, fixedDeps);

  assert.equal(version.id, 'pver_fixed');
  assert.equal(version.assetId, 'asset_1');
  assert.equal(version.label, '第一版');
  assert.equal(version.userPromptTemplate, '只返回 JSON');
  assert.equal(version.systemPrompt, '');
  assert.equal(version.sourceType, 'manual');
});

test('createOptimizationDataset 会标准化 comparisonRows 与 pdfFileIds', () => {
  const dataset = createOptimizationDataset({
    name: '  气候数据集  ',
    comparisonRows: [{ indicator_code: 'E1' }],
    pdfFileIds: ['pdf_a', 'pdf_a', 'pdf_b']
  }, fixedDeps);

  assert.equal(dataset.id, 'pods_fixed');
  assert.equal(dataset.name, '气候数据集');
  assert.deepEqual(dataset.pdfFileIds, ['pdf_a', 'pdf_b']);
  assert.equal(dataset.comparisonRows.length, 1);
});

test('summarizeOptimizationRun 会选出最佳候选并生成改善幅度', () => {
  const summary = summarizeOptimizationRun(createOptimizationRun({
    id: 'run_1',
    baselineScore: 61,
    candidates: [
      { id: 'cand_a', score: { overall: 67 } },
      { id: 'cand_b', score: { overall: 79 } }
    ]
  }, fixedDeps));

  assert.equal(summary.bestCandidateId, 'cand_b');
  assert.equal(summary.bestScore, 79);
  assert.equal(summary.improvement, 18);
});
