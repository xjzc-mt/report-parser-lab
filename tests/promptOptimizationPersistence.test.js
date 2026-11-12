import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearPromptOptimizationRunHistory,
  clearPromptOptimizationData,
  getPromptOptimizationRun,
  getPromptOptimizationStrategyEntry,
  getPromptOptimizationTrace,
  getPromptOptimizationWorkspaceEntry,
  listPromptOptimizationRunSummaries,
  listPromptOptimizationRuns,
  restorePromptOptimizationWorkspaceFiles,
  listPromptVersions,
  savePromptAsset,
  savePromptOptimizationDataset,
  savePromptOptimizationRun,
  savePromptOptimizationStrategyEntry,
  savePromptOptimizationTrace,
  savePromptOptimizationWorkspaceEntry,
  savePromptOptimizationWorkspaceFiles,
  savePromptVersion
} from '../src/services/promptOptimizationRepository.js';

test('Prompt 自动优化 run 可保存并列出', async () => {
  await clearPromptOptimizationData();
  await savePromptOptimizationRun({
    id: 'run_1',
    assetId: 'asset_1',
    baselineVersionId: 'pver_1',
    datasetId: 'pods_1',
    status: 'completed',
    updatedAt: 1
  });
  await savePromptOptimizationRun({
    id: 'run_2',
    assetId: 'asset_1',
    baselineVersionId: 'pver_2',
    datasetId: 'pods_2',
    status: 'completed',
    updatedAt: 2
  });

  const runs = await listPromptOptimizationRuns();
  assert.deepEqual(runs.map((item) => item.id), ['run_2', 'run_1']);
});

test('Prompt 自动优化历史摘要可单独读取并支持清空', async () => {
  await clearPromptOptimizationData();
  await savePromptOptimizationRun({
    id: 'run_1',
    assetId: 'asset_1',
    baselineVersionId: 'pver_1',
    datasetId: 'pods_1',
    status: 'completed',
    targetName: '排放总量',
    indicatorCode: 'E1',
    modelName: 'gemini-2.5-pro',
    baselineScore: 40,
    candidates: [{ id: 'cand_1', score: { overall: 82 } }],
    updatedAt: 2
  });

  const summaries = await listPromptOptimizationRunSummaries();
  const detail = await getPromptOptimizationRun('run_1');

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, 'run_1');
  assert.equal(summaries[0].bestScore, 82);
  assert.equal(detail.id, 'run_1');

  await clearPromptOptimizationRunHistory();

  assert.deepEqual(await listPromptOptimizationRunSummaries(), []);
  assert.equal(await getPromptOptimizationRun('run_1'), undefined);
});

test('Prompt 自动优化 trace 会按 runId 聚合保存', async () => {
  await clearPromptOptimizationData();
  await savePromptOptimizationTrace('run_1', [
    { id: 'trace_1', phase: 'candidate_generation', message: '生成候选A' }
  ]);
  await savePromptOptimizationTrace('run_1', [
    { id: 'trace_2', phase: 'evaluation', message: '验证候选A' }
  ]);

  const trace = await getPromptOptimizationTrace('run_1');
  assert.deepEqual(trace.map((item) => item.id), ['trace_1', 'trace_2']);
});

test('Prompt 自动优化版本、资产和数据集可分别保存', async () => {
  await clearPromptOptimizationData();

  const asset = await savePromptAsset({ id: 'asset_1', name: '排放目标' });
  const dataset = await savePromptOptimizationDataset({ id: 'pods_1', name: '排放数据集' });
  const version = await savePromptVersion({
    id: 'pver_1',
    assetId: 'asset_1',
    label: '初始版本'
  });

  const versions = await listPromptVersions();

  assert.equal(asset.id, 'asset_1');
  assert.equal(dataset.id, 'pods_1');
  assert.equal(version.id, 'pver_1');
  assert.deepEqual(versions.map((item) => item.id), ['pver_1']);
});

test('Prompt 自动优化工作区状态可保存并恢复', async () => {
  await clearPromptOptimizationData();

  await savePromptOptimizationWorkspaceEntry({
    selectedTargetCode: 'E1',
    targetName: '排放总量',
    maxIterations: 3,
    activeTab: 'review',
    currentRunId: 'run_2',
    comparisonRows: [{ indicator_code: 'E1' }]
  });

  const workspace = await getPromptOptimizationWorkspaceEntry();
  assert.equal(workspace.selectedTargetCode, 'E1');
  assert.equal(workspace.activeTab, 'review');
  assert.equal(workspace.currentRunId, 'run_2');
});

test('Prompt 自动优化工作区文件可保存并恢复', async () => {
  await clearPromptOptimizationData();

  const comparisonFile = new File([Uint8Array.from([1, 2, 3])], 'comparison.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    lastModified: 111
  });
  const pdfFile = new File([Uint8Array.from([4, 5, 6])], 'A.pdf', {
    type: 'application/pdf',
    lastModified: 222
  });

  await savePromptOptimizationWorkspaceEntry({
    comparisonFile: {
      id: 'comparison_1',
      name: comparisonFile.name,
      type: comparisonFile.type
    },
    pdfFiles: [
      {
        id: 'pdf_1',
        name: pdfFile.name,
        type: pdfFile.type
      }
    ]
  });

  await savePromptOptimizationWorkspaceFiles({
    comparisonFile: {
      id: 'comparison_1',
      file: comparisonFile
    },
    pdfFiles: [
      {
        id: 'pdf_1',
        file: pdfFile
      }
    ]
  });

  const restored = await restorePromptOptimizationWorkspaceFiles(
    await getPromptOptimizationWorkspaceEntry()
  );

  assert.equal(restored.comparisonFile.file instanceof File, true);
  assert.equal(restored.comparisonFile.file.name, 'comparison.xlsx');
  assert.equal(restored.pdfFiles[0].file instanceof File, true);
  assert.equal(restored.pdfFiles[0].file.name, 'A.pdf');
});

test('Prompt 自动优化策略可单独保存并读取', async () => {
  await clearPromptOptimizationData();

  await savePromptOptimizationStrategyEntry({
    diagnosisUserTemplate: '诊断模板',
    candidateUserTemplate: '生成模板',
    validationUserTemplate: '验证模板'
  });

  const strategy = await getPromptOptimizationStrategyEntry();
  assert.equal(strategy.diagnosisUserTemplate, '诊断模板');
  assert.equal(strategy.candidateUserTemplate, '生成模板');
  assert.equal(strategy.validationUserTemplate, '验证模板');
});
