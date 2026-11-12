import { isResultFound } from './extraction.js';

const PLAN_KEYS = [
  'totalInputIndicators',
  'totalIndicators',
  'totalBatches',
  'textCount',
  'numericCount',
  'intensityCount',
  'currencyCount',
  'textBatches',
  'numericBatches',
  'intensityBatches',
  'currencyBatches'
];

const COUNTER_KEYS = [
  'startedBatches',
  'completedBatches',
  'startedIndicators',
  'completedIndicators',
  'foundIndicators',
  'failedBatches',
  'failedIndicators',
  'pdfTextFallbacks',
  'totalInputTokens',
  'totalOutputTokens',
  'totalCost',
  'failedFiles'
];

export function mergeExtractionFileStats(aggregated, fileStats, totalFiles, planInitialized) {
  const next = { ...aggregated };
  const fileCount = Math.max(1, Number(totalFiles) || 1);

  if (!planInitialized) {
    for (const key of PLAN_KEYS) {
      next[key] = Number(fileStats[key] || 0) * fileCount;
    }
  }
  for (const key of COUNTER_KEYS) {
    next[key] = Number(next[key] || 0) + Number(fileStats[key] || 0);
  }
  next.executedBatches = next.startedBatches;
  next.unstartedIndicators = Math.max(0, next.totalIndicators - next.startedIndicators);
  return { stats: next, planInitialized: true };
}

export function countFoundInputIndicators(batch = [], batchResults = []) {
  const foundCodes = new Set(
    (Array.isArray(batchResults) ? batchResults : [])
      // 与结果表筛选、导出摘要共用同一套缺失值判定。
      .filter(isResultFound)
      .map((result) => String(result.indicator_code || '').trim())
      .filter(Boolean)
  );
  return (Array.isArray(batch) ? batch : []).filter((requirement) => (
    foundCodes.has(String(requirement.indicator_code || '').trim())
  )).length;
}
