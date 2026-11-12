function fallbackCreateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveNow(deps = {}) {
  return deps.now?.() ?? Date.now();
}

function resolveCreateId(deps = {}) {
  return deps.createId ?? fallbackCreateId;
}

function normalizeString(value) {
  return String(value || '').trim();
}

function uniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .map((value) => normalizeString(value))
      .filter(Boolean)
  ));
}

export function createPromptAsset(raw = {}, deps = {}) {
  const now = resolveNow(deps);
  const createId = resolveCreateId(deps);

  return {
    id: normalizeString(raw.id) || createId('passet'),
    name: normalizeString(raw.name) || '未命名 Prompt',
    targetName: normalizeString(raw.targetName),
    indicatorCode: normalizeString(raw.indicatorCode || raw.indicator_code),
    indicatorName: normalizeString(raw.indicatorName || raw.indicator_name),
    valueType: normalizeString(raw.valueType || raw.value_type),
    latestVersionId: normalizeString(raw.latestVersionId),
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now)
  };
}

export function createPromptVersion(raw = {}, deps = {}) {
  const now = resolveNow(deps);
  const createId = resolveCreateId(deps);

  return {
    id: normalizeString(raw.id) || createId('pver'),
    assetId: normalizeString(raw.assetId),
    label: normalizeString(raw.label) || '初始版本',
    systemPrompt: normalizeString(raw.systemPrompt),
    userPromptTemplate: normalizeString(raw.userPromptTemplate || raw.prompt),
    outputContract: normalizeString(raw.outputContract),
    notes: normalizeString(raw.notes),
    sourceType: normalizeString(raw.sourceType) || 'manual',
    parentVersionId: normalizeString(raw.parentVersionId),
    metricsSnapshot: raw.metricsSnapshot ?? null,
    createdAt: Number(raw.createdAt || now)
  };
}

export function createOptimizationDataset(raw = {}, deps = {}) {
  const now = resolveNow(deps);
  const createId = resolveCreateId(deps);

  return {
    id: normalizeString(raw.id) || createId('pods'),
    name: normalizeString(raw.name) || '未命名数据集',
    sourceType: normalizeString(raw.sourceType) || 'comparison_file',
    targetName: normalizeString(raw.targetName),
    comparisonRows: Array.isArray(raw.comparisonRows) ? raw.comparisonRows : [],
    pdfFileIds: uniqueStrings(raw.pdfFileIds),
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now)
  };
}

export function createOptimizationRun(raw = {}, deps = {}) {
  const now = resolveNow(deps);
  const createId = resolveCreateId(deps);

  return {
    id: normalizeString(raw.id) || createId('porun'),
    assetId: normalizeString(raw.assetId),
    baselineVersionId: normalizeString(raw.baselineVersionId),
    datasetId: normalizeString(raw.datasetId),
    status: normalizeString(raw.status) || 'draft',
    baselineScore: Number(raw.baselineScore || 0),
    baselinePromptText: normalizeString(raw.baselinePromptText),
    bestCandidateId: normalizeString(raw.bestCandidateId),
    appliedVersionId: normalizeString(raw.appliedVersionId),
    candidates: Array.isArray(raw.candidates) ? raw.candidates : [],
    traceEntries: Array.isArray(raw.traceEntries) ? raw.traceEntries : [],
    targetName: normalizeString(raw.targetName),
    indicatorCode: normalizeString(raw.indicatorCode || raw.indicator_code),
    indicatorName: normalizeString(raw.indicatorName || raw.indicator_name),
    modelName: normalizeString(raw.modelName),
    providerType: normalizeString(raw.providerType),
    tokenStats: raw.tokenStats ?? null,
    resultRows: Array.isArray(raw.resultRows) ? raw.resultRows : [],
    iterationDetails: Array.isArray(raw.iterationDetails) ? raw.iterationDetails : [],
    strategySnapshot: raw.strategySnapshot ?? null,
    rounds: Array.isArray(raw.rounds) ? raw.rounds : [],
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now)
  };
}

export function summarizeOptimizationRun(run) {
  const candidates = Array.isArray(run?.candidates) ? run.candidates : [];
  const sorted = [...candidates].sort(
    (left, right) => Number(right?.score?.overall || 0) - Number(left?.score?.overall || 0)
  );
  const bestCandidate = sorted[0] || null;
  const bestScore = Number(bestCandidate?.score?.overall || run?.baselineScore || 0);

  return {
    bestCandidateId: bestCandidate?.id || '',
    bestScore,
    improvement: bestScore - Number(run?.baselineScore || 0)
  };
}

export function createOptimizationRunSummary(raw = {}, deps = {}) {
  const now = resolveNow(deps);

  return {
    id: normalizeString(raw.id),
    assetId: normalizeString(raw.assetId),
    baselineVersionId: normalizeString(raw.baselineVersionId),
    datasetId: normalizeString(raw.datasetId),
    status: normalizeString(raw.status) || 'draft',
    targetName: normalizeString(raw.targetName),
    indicatorCode: normalizeString(raw.indicatorCode || raw.indicator_code),
    indicatorName: normalizeString(raw.indicatorName || raw.indicator_name),
    modelName: normalizeString(raw.modelName),
    providerType: normalizeString(raw.providerType),
    baselineScore: Number(raw.baselineScore || 0),
    bestCandidateId: normalizeString(raw.bestCandidateId),
    bestScore: Number(raw.bestScore ?? raw.baselineScore ?? 0),
    appliedVersionId: normalizeString(raw.appliedVersionId),
    tokenStats: raw.tokenStats ?? null,
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now)
  };
}

export function summarizeOptimizationRunEntry(run = {}, deps = {}) {
  const summary = summarizeOptimizationRun(run);
  return createOptimizationRunSummary({
    ...run,
    bestCandidateId: run?.bestCandidateId || summary.bestCandidateId,
    bestScore: run?.bestScore ?? summary.bestScore
  }, deps);
}
