import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOptimizationCandidate,
  createDatasetFromComparisonRows,
  startPromptOptimizationRun
} from '../src/services/promptOptimizationService.js';

test('createDatasetFromComparisonRows 会生成 comparison_file 数据集', () => {
  const dataset = createDatasetFromComparisonRows({
    name: '排放数据集',
    targetName: '排放总量',
    comparisonRows: [{ indicator_code: 'E1' }],
    pdfFileIds: ['A.pdf']
  }, {
    now: () => 1000,
    createId: () => 'pods_1'
  });

  assert.equal(dataset.id, 'pods_1');
  assert.equal(dataset.sourceType, 'comparison_file');
  assert.equal(dataset.targetName, '排放总量');
});

test('startPromptOptimizationRun 会保存 asset、dataset、run 与 trace', async () => {
  const calls = [];
  const repository = {
    savePromptAsset: async (asset) => {
      calls.push(['asset', asset.id]);
      return asset;
    },
    savePromptOptimizationDataset: async (dataset) => {
      calls.push(['dataset', dataset.id]);
      return dataset;
    },
    savePromptVersion: async (version) => {
      calls.push(['version', version.id]);
      return version;
    },
    savePromptOptimizationRun: async (run) => {
      calls.push(['run', run.id]);
      return run;
    },
    savePromptOptimizationTrace: async (runId, traceEntries) => {
      calls.push(['trace', runId, traceEntries.length]);
    }
  };
  const engine = async () => ({
    run: {
      id: 'run_1',
      baselineScore: 55,
      candidates: [{ id: 'cand_1', promptText: '新 Prompt', score: { overall: 78 } }],
      traceEntries: [{ id: 'trace_1', phase: 'evaluation' }]
    },
    resultRows: []
  });

  const result = await startPromptOptimizationRun({
    asset: { id: 'asset_1' },
    baselineVersion: { id: 'pver_1' },
    dataset: { id: 'pods_1', comparisonRows: [] },
    llmSettings: { modelName: 'gemini-2.5-pro' }
  }, { repository, engine });

  assert.equal(result.run.id, 'run_1');
  assert.equal(result.run.candidates[0].score.overall, 78);
  assert.deepEqual(calls, [
    ['asset', 'asset_1'],
    ['dataset', 'pods_1'],
    ['version', 'pver_1'],
    ['run', 'run_1'],
    ['trace', 'run_1', 1]
  ]);
});

test('applyOptimizationCandidate 会创建新版本并回填 run', async () => {
  const savedVersions = [];
  const savedRuns = [];
  const savedAssets = [];
  const repository = {
    savePromptAsset: async (asset) => {
      savedAssets.push(asset);
      return asset;
    },
    savePromptVersion: async (version) => {
      savedVersions.push(version);
      return version;
    },
    savePromptOptimizationRun: async (run) => {
      savedRuns.push(run);
      return run;
    }
  };

  const next = await applyOptimizationCandidate({
    asset: { id: 'asset_1' },
    run: {
      id: 'run_1',
      candidates: [{ id: 'cand_1', promptText: '严格输出 JSON', score: { overall: 80 } }]
    },
    candidateId: 'cand_1'
  }, {
    repository,
    now: () => 1000,
    createId: () => 'pver_optimized_1'
  });

  assert.equal(savedVersions[0].id, 'pver_optimized_1');
  assert.equal(savedVersions[0].sourceType, 'optimized');
  assert.equal(savedAssets[0].latestVersionId, 'pver_optimized_1');
  assert.equal(next.appliedVersionId, 'pver_optimized_1');
  assert.equal(savedRuns[0].bestCandidateId, 'cand_1');
});
