import {
  createOptimizationDataset,
  createPromptVersion
} from '../utils/promptOptimizationModel.js';
import * as repository from './promptOptimizationRepository.js';
import { runPromptOptimizationEngine } from './promptOptimizationEngine.js';

export function createDatasetFromComparisonRows(
  { name, targetName, comparisonRows, pdfFileIds },
  deps = {}
) {
  return createOptimizationDataset({
    name,
    targetName,
    comparisonRows,
    pdfFileIds,
    sourceType: 'comparison_file'
  }, deps);
}

export async function startPromptOptimizationRun(input, deps = {}) {
  const repo = deps.repository ?? repository;
  const engine = deps.engine ?? runPromptOptimizationEngine;

  await repo.savePromptAsset?.(input.asset);
  await repo.savePromptOptimizationDataset?.(input.dataset);
  await repo.savePromptVersion?.(input.baselineVersion);

  if (input.signal?.aborted) {
    const abortError = new Error('运行已取消');
    abortError.name = 'AbortError';
    throw abortError;
  }

  const result = await engine({
    assetId: input.asset.id,
    baselineVersion: input.baselineVersion,
    datasetId: input.dataset.id,
    targetName: input.dataset.targetName,
    comparisonRows: input.dataset.comparisonRows,
    pdfFiles: input.pdfFiles,
    llmSettings: input.llmSettings,
    strategy: input.strategy,
    tokenStats: input.tokenStats,
    signal: input.signal
  }, deps.engineDeps);

  if (input.signal?.aborted) {
    const abortError = new Error('运行已取消');
    abortError.name = 'AbortError';
    throw abortError;
  }

  await repo.savePromptOptimizationRun(result.run);
  await repo.savePromptOptimizationTrace(result.run.id, result.run.traceEntries || []);

  return result;
}

export async function applyOptimizationCandidate({ asset, run, candidateId }, deps = {}) {
  const repo = deps.repository ?? repository;
  const candidate = (run.candidates || []).find((item) => item.id === candidateId);

  if (!candidate) {
    throw new Error('未找到待应用的候选 Prompt');
  }

  const version = createPromptVersion({
    assetId: asset.id,
    label: `优化版 ${new Date((deps.now?.() ?? Date.now())).toLocaleString()}`,
    userPromptTemplate: candidate.promptText,
    sourceType: 'optimized',
    metricsSnapshot: candidate.score
  }, deps);

  await repo.savePromptVersion(version);
  if (typeof repo.savePromptAsset === 'function') {
    const persistedAsset = typeof repo.getPromptAsset === 'function'
      ? await repo.getPromptAsset(asset.id)
      : null;
    await repo.savePromptAsset({
      ...(persistedAsset || {}),
      ...asset,
      latestVersionId: version.id,
      updatedAt: deps.now?.() ?? Date.now()
    });
  }

  const nextRun = {
    ...run,
    appliedVersionId: version.id,
    bestCandidateId: candidateId,
    updatedAt: deps.now?.() ?? Date.now()
  };

  await repo.savePromptOptimizationRun(nextRun);
  return nextRun;
}
