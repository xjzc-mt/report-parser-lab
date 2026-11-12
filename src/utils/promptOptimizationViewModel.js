import { createOptimizationRun } from './promptOptimizationModel.js';

function normalizeString(value) {
  return String(value || '').trim();
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function normalizeSimilarity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeQuery(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeValueType(value) {
  const normalized = normalizeString(value).toUpperCase();
  if (!normalized) {
    return '其他';
  }
  if (normalized === 'TEXT' || normalized.includes('文字')) {
    return '文字型';
  }
  if (normalized === 'NUMERIC' || normalized === 'CURRENCY' || normalized.includes('数值') || normalized.includes('货币')) {
    return '数值型';
  }
  if (normalized === 'INTENSITY' || normalized.includes('强度')) {
    return '强度型';
  }
  return '其他';
}

const VALUE_TYPE_ORDER = ['文字型', '数值型', '强度型', '其他'];

export function buildPromptOptimizationIndicatorCatalog(rows = []) {
  const catalogMap = new Map();

  for (const row of rows) {
    const code = normalizeString(row?.indicator_code);
    if (!code) {
      continue;
    }

    const current = catalogMap.get(code) || {
      code,
      name: normalizeString(row?.indicator_name) || '未命名指标',
      valueType: normalizeValueType(row?.value_type_1 || row?.value_type),
      similarities: [],
      rowCount: 0
    };

    current.name = current.name || normalizeString(row?.indicator_name) || '未命名指标';
    current.valueType = current.valueType === '其他'
      ? normalizeValueType(row?.value_type_1 || row?.value_type)
      : current.valueType;
    current.similarities.push(normalizeSimilarity(row?.similarity));
    current.rowCount += 1;
    catalogMap.set(code, current);
  }

  return Array.from(catalogMap.values())
    .map((item) => ({
      code: item.code,
      name: item.name,
      valueType: item.valueType,
      rowCount: item.rowCount,
      averageSimilarity: average(item.similarities),
      minSimilarity: item.similarities.length ? Math.min(...item.similarities) : 0,
      maxSimilarity: item.similarities.length ? Math.max(...item.similarities) : 0,
      label: `${item.code} · ${item.name}`
    }))
    .sort((left, right) => (
      left.averageSimilarity - right.averageSimilarity
      || left.code.localeCompare(right.code, 'zh-Hans-CN')
    ));
}

export function buildPromptOptimizationIndicatorGroups(rows = [], {
  minSimilarity = 0,
  maxSimilarity = 100,
  query = ''
} = {}) {
  const normalizedQuery = normalizeQuery(query);
  const catalog = buildPromptOptimizationIndicatorCatalog(rows)
    .filter((item) => item.averageSimilarity >= Number(minSimilarity ?? 0) && item.averageSimilarity <= Number(maxSimilarity ?? 100))
    .filter((item) => {
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${item.code} ${item.name} ${item.label}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

  return VALUE_TYPE_ORDER
    .map((type) => ({
      type,
      items: catalog.filter((item) => item.valueType === type)
    }))
    .filter((group) => group.items.length > 0);
}

export function buildPromptOptimizationTargetOptions(rows = [], preselectedCodes = []) {
  const allowedCodes = new Set(
    (Array.isArray(preselectedCodes) ? preselectedCodes : [])
      .map((value) => normalizeString(value))
      .filter(Boolean)
  );

  return buildPromptOptimizationIndicatorCatalog(rows)
    .filter((item) => allowedCodes.size === 0 || allowedCodes.has(item.code))
    .map((item) => ({
      value: item.code,
      label: item.label,
      code: item.code,
      name: item.name
    }));
}

export function buildPromptOptimizationBatchTargets(rows = [], selectedCodes = []) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const codes = (Array.isArray(selectedCodes) ? selectedCodes : [])
    .map((value) => normalizeString(value))
    .filter(Boolean);
  const rowsByCode = new Map();
  const catalog = buildPromptOptimizationIndicatorCatalog(normalizedRows);
  const nameLookup = new Map(catalog.map((item) => [item.code, item.name]));

  for (const row of normalizedRows) {
    const code = normalizeString(row?.indicator_code);
    if (!code || !codes.includes(code)) {
      continue;
    }
    const current = rowsByCode.get(code) || [];
    current.push(row);
    rowsByCode.set(code, current);
  }

  return codes
    .filter((code) => rowsByCode.has(code))
    .map((code) => ({
      code,
      name: nameLookup.get(code) || '未命名指标',
      rows: rowsByCode.get(code) || []
    }));
}

export function buildPromptOptimizationSelectionSummary(catalog = [], selectedCodes = []) {
  const allowedCodes = new Set(
    (Array.isArray(selectedCodes) ? selectedCodes : [])
      .map((value) => normalizeString(value))
      .filter(Boolean)
  );

  const selectedItems = (Array.isArray(catalog) ? catalog : []).filter((item) => allowedCodes.has(item.code));
  const typeCounts = new Map();
  let selectedRowCount = 0;

  selectedItems.forEach((item) => {
    selectedRowCount += Number(item.rowCount || 0);
    typeCounts.set(item.valueType, (typeCounts.get(item.valueType) || 0) + 1);
  });

  const typeBreakdown = VALUE_TYPE_ORDER
    .map((type) => ({ type, count: typeCounts.get(type) || 0 }))
    .filter((item) => item.count > 0);

  return {
    selectedCount: selectedItems.length,
    selectedRowCount,
    typeBreakdown,
    previewLabels: selectedItems.slice(0, 3).map((item) => item.label || `${item.code} · ${item.name}`)
  };
}

export function buildIncomingOptimizationWorkspaceState({
  comparisonRows = [],
  comparisonFile = null,
  selectedCodes = [],
  preselectedCodes = []
} = {}) {
  const normalizedRows = Array.isArray(comparisonRows) ? comparisonRows : [];
  const allOptions = buildPromptOptimizationTargetOptions(normalizedRows, []);
  const availableCodes = new Set(allOptions.map((item) => item.value));
  const preferredCodes = (selectedCodes.length ? selectedCodes : preselectedCodes)
    .map((value) => normalizeString(value))
    .filter((value) => availableCodes.has(value));
  const selectedTargetCodes = preferredCodes.length
    ? Array.from(new Set(preferredCodes))
    : allOptions.slice(0, 1).map((item) => item.value);

  return {
    comparisonRows: normalizedRows,
    comparisonFile,
    selectedTargetCodes,
    activeTab: 'setup'
  };
}

function buildTraceEntries(iterationDetails = [], now = () => Date.now()) {
  return iterationDetails.map((item, index) => ({
    id: `trace_${index + 1}`,
    phase: Number(item?.iter || 0) === 0 ? 'baseline' : 'evaluation',
    indicatorCode: normalizeString(item?.indicator_code),
    indicatorName: normalizeString(item?.indicator_name),
    message: `${Number(item?.iter || 0) === 0 ? '原始' : `第${item.iter}轮`} · ${normalizeString(item?.report_name)} · ${Number(item?.similarity || 0)} 分`,
    promptText: normalizeString(item?.prompt),
    llmText: normalizeString(item?.llm_text),
    accepted: normalizeString(item?.is_accepted),
    createdAt: now()
  }));
}

export function buildPromptOptimizationRunSnapshot({
  assetId,
  baselineVersionId,
  baselinePromptText,
  targetName,
  rows = [],
  updatedRows = [],
  iterationDetails = [],
  llmSettings = {},
  now = () => Date.now()
}) {
  const baselineScore = average(rows.map((row) => Number(row?.similarity || 0)));
  const candidatePromptText = normalizeString(
    updatedRows.find((row) => normalizeString(row?.improved_prompt))?.improved_prompt || baselinePromptText
  );
  const candidateScore = average(
    updatedRows.map((row) => Number((row?.post_similarity ?? row?.similarity) || 0))
  );
  const indicatorCode = normalizeString(rows[0]?.indicator_code);
  const indicatorName = normalizeString(rows[0]?.indicator_name);
  const candidateId = `cand_${indicatorCode || 'prompt'}_1`;
  const traceEntries = buildTraceEntries(iterationDetails, now);

  const run = {
    ...createOptimizationRun({
      assetId,
      baselineVersionId,
      status: 'completed',
      baselineScore,
      baselinePromptText,
      bestCandidateId: candidateId,
      candidates: [
        {
          id: candidateId,
          indicatorCode,
          indicatorName,
          promptText: candidatePromptText,
          score: { overall: candidateScore },
          sampleResults: updatedRows.map((row) => ({
            report_name: normalizeString(row?.report_name),
            similarity: Number((row?.post_similarity ?? row?.similarity) || 0),
            text: normalizeString(row?.llm_text_value || row?.llm_num_value)
          }))
        }
      ],
      traceEntries,
      createdAt: now(),
      updatedAt: now()
    }, { now }),
    targetName: normalizeString(targetName) || indicatorName,
    indicatorCode,
    indicatorName,
    modelName: normalizeString(llmSettings?.modelName),
    providerType: normalizeString(llmSettings?.providerType),
    resultRows: updatedRows,
    iterationDetails,
    bestScore: candidateScore
  };

  return {
    run,
    resultRows: updatedRows
  };
}
