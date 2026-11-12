import {
  clearPromptAssetEntries,
  clearPromptOptimizationRunHistoryEntries,
  clearPromptOptimizationEntries,
  clearPromptOptimizationWorkspaceState as clearPromptOptimizationWorkspaceStateEntry,
  deletePromptOptimizationVersionEntry as deletePromptOptimizationVersionEntryPersisted,
  getPromptOptimizationAssetEntry,
  getPromptOptimizationRunEntry,
  getPromptOptimizationStrategyEntry as getPromptOptimizationStrategyEntryPersisted,
  getPromptOptimizationTraceEntry,
  getPromptOptimizationWorkspaceEntry as getPromptOptimizationWorkspaceEntryPersisted,
  getPromptOptimizationVersionEntry,
  listPromptOptimizationAssetEntries,
  listPromptOptimizationRunEntries,
  listPromptOptimizationRunSummaryEntries,
  listPromptOptimizationVersionEntries,
  restorePromptOptimizationWorkspaceFiles as restorePromptOptimizationWorkspaceFilesPersisted,
  savePromptOptimizationAssetEntry,
  savePromptOptimizationDatasetEntry,
  savePromptOptimizationRunEntry,
  savePromptOptimizationRunSummaryEntry,
  savePromptOptimizationStrategyEntry as savePromptOptimizationStrategyEntryPersisted,
  savePromptOptimizationTraceEntry,
  savePromptOptimizationWorkspaceEntry as savePromptOptimizationWorkspaceEntryPersisted,
  savePromptOptimizationWorkspaceFiles as savePromptOptimizationWorkspaceFilesPersisted,
  savePromptOptimizationVersionEntry
} from './persistenceService.js';
import { summarizeOptimizationRunEntry } from '../utils/promptOptimizationModel.js';

export async function savePromptAsset(asset) {
  await savePromptOptimizationAssetEntry(asset);
  return asset;
}

export async function getPromptAsset(id) {
  return getPromptOptimizationAssetEntry(id);
}

export async function listPromptAssets() {
  const assets = await listPromptOptimizationAssetEntries();
  return [...assets].sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

export async function savePromptOptimizationDataset(dataset) {
  await savePromptOptimizationDatasetEntry(dataset);
  return dataset;
}

export async function savePromptVersion(version) {
  await savePromptOptimizationVersionEntry(version);
  return version;
}

export async function getPromptVersion(id) {
  return getPromptOptimizationVersionEntry(id);
}

export async function deletePromptVersion(id) {
  await deletePromptOptimizationVersionEntryPersisted(id);
}

export async function listPromptVersions() {
  const versions = await listPromptOptimizationVersionEntries();
  return [...versions].sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
}

export async function savePromptOptimizationRun(run) {
  await savePromptOptimizationRunEntry(run);
  await savePromptOptimizationRunSummaryEntry(summarizeOptimizationRunEntry(run));
  return run;
}

export async function getPromptOptimizationRun(id) {
  return getPromptOptimizationRunEntry(id);
}

export async function listPromptOptimizationRuns() {
  const runs = await listPromptOptimizationRunEntries();
  return [...runs].sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

export async function listPromptOptimizationRunSummaries() {
  const runs = await listPromptOptimizationRunSummaryEntries();
  return [...runs].sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

export async function savePromptOptimizationTrace(runId, entries) {
  await savePromptOptimizationTraceEntry(runId, entries);
}

export async function getPromptOptimizationTrace(runId) {
  return (await getPromptOptimizationTraceEntry(runId))?.entries ?? [];
}

export async function savePromptOptimizationWorkspaceEntry(workspace) {
  await savePromptOptimizationWorkspaceEntryPersisted(workspace);
  return workspace;
}

export async function getPromptOptimizationWorkspaceEntry() {
  return getPromptOptimizationWorkspaceEntryPersisted();
}

export async function savePromptOptimizationWorkspaceFiles(files) {
  await savePromptOptimizationWorkspaceFilesPersisted(files);
}

export async function restorePromptOptimizationWorkspaceFiles(workspace) {
  return restorePromptOptimizationWorkspaceFilesPersisted(workspace);
}

export async function savePromptOptimizationStrategyEntry(strategy) {
  await savePromptOptimizationStrategyEntryPersisted(strategy);
  return strategy;
}

export async function getPromptOptimizationStrategyEntry() {
  return getPromptOptimizationStrategyEntryPersisted();
}

export async function clearPromptAssets() {
  await clearPromptAssetEntries();
}

export async function clearPromptOptimizationRunHistory() {
  await clearPromptOptimizationRunHistoryEntries();
}

export async function clearPromptOptimizationData() {
  await clearPromptOptimizationEntries();
  await clearPromptOptimizationWorkspaceStateEntry();
}
