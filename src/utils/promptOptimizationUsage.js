import { estimateCost } from '../services/llmClient.js';

function normalizeNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCost(value) {
  return Number(normalizeNumber(value).toFixed(6));
}

export function summarizePromptOptimizationUsage(run = {}) {
  const tokenStats = run?.tokenStats ?? {};
  const optimizationInputTokens = normalizeNumber(tokenStats.optInput);
  const optimizationOutputTokens = normalizeNumber(tokenStats.optOutput);
  const extractionInputTokens = normalizeNumber(tokenStats.extractInput);
  const extractionOutputTokens = normalizeNumber(tokenStats.extractOutput);
  const totalInputTokens = optimizationInputTokens + extractionInputTokens;
  const totalOutputTokens = optimizationOutputTokens + extractionOutputTokens;
  const modelName = String(run?.modelName || '').trim();

  const optimizationCostUsd = roundCost(estimateCost(modelName, optimizationInputTokens, optimizationOutputTokens));
  const extractionCostUsd = roundCost(estimateCost(modelName, extractionInputTokens, extractionOutputTokens));
  const totalCostUsd = roundCost(optimizationCostUsd + extractionCostUsd);

  return {
    modelName,
    optimizationInputTokens,
    optimizationOutputTokens,
    extractionInputTokens,
    extractionOutputTokens,
    totalInputTokens,
    totalOutputTokens,
    optimizationCostUsd,
    extractionCostUsd,
    totalCostUsd
  };
}
