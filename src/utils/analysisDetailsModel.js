import { normalizeAnalysisValueType, normalizeDetailValueType } from './analysisV2Metrics.js';

export const CATEGORY_META = {
  perfect_match: { label: '完美匹配', color: '#166534', background: '#dcfce7', segmentColor: '#16a34a' },
  pass_match: { label: '达标匹配', color: '#14532d', background: '#dcfce7', segmentColor: '#86efac' },
  single_fail: { label: '单条错误', color: '#78350f', background: '#fef3c7', segmentColor: '#fbbf24' },
  duplicate_with_pass: { label: '重复摘录-含达标', color: '#1d4ed8', background: '#dbeafe', segmentColor: '#60a5fa', lines: ['重复摘录', '含达标'] },
  duplicate_without_pass: { label: '重复摘录-无达标', color: '#991b1b', background: '#fee2e2', segmentColor: '#fca5a5', lines: ['重复摘录', '无达标'] },
  miss: { label: '漏摘录', color: '#fff', background: '#f87171', segmentColor: '#f87171' },
  hallucination: { label: '幻觉', color: '#fff', background: '#c084fc', segmentColor: '#c084fc' }
};

export const EMPTY_DETAIL_FILTERS = {
  reportNames: [],
  indicators: [],
  valueTypes: [],
  outputCounts: [],
  similarities: [],
  similarityRange: [0, 100],
  categories: []
};

const DETAIL_ROW_HEIGHTS = {
  文字型: 252,
  强度型: 156,
  数值型: 116,
  货币型: 132
};

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'));
}

export function getFieldsForRows(expectedRow = {}, actualRow = {}, rawType = '文字型') {
  const type = normalizeDetailValueType(rawType);
  const hasCurrency = String(expectedRow.currency || actualRow.llm_currency || actualRow.currency || '').trim();

  if (type === '文字型') {
    return {
      expected: [
        { label: '页码', value: expectedRow.pdf_numbers || '—' },
        { label: '值', value: expectedRow.text_value || '—', compareValue: actualRow.llm_text_value || '—', highlight: true, maxLines: 12, alwaysTooltip: true }
      ],
      actual: [
        { label: '页码', value: actualRow.llm_pdf_numbers || '—' },
        { label: '值', value: actualRow.llm_text_value || '—', compareValue: expectedRow.text_value || '—', highlight: true, maxLines: 12, alwaysTooltip: true }
      ]
    };
  }

  if (type === '强度型') {
    return {
      expected: [
        { label: '页码', value: expectedRow.pdf_numbers || '—' },
        { label: '值', value: expectedRow.num_value || '—', compareValue: actualRow.llm_num_value || '—', highlight: true },
        { label: '单位', value: expectedRow.unit || '—', compareValue: actualRow.llm_unit || '—', highlight: true },
        { label: '分子单位', value: expectedRow.numerator_unit || '—', compareValue: actualRow.llm_numerator_unit || '—', highlight: true },
        { label: '分母单位', value: expectedRow.denominator_unit || '—', compareValue: actualRow.llm_denominator_unit || '—', highlight: true }
      ],
      actual: [
        { label: '页码', value: actualRow.llm_pdf_numbers || '—' },
        { label: '值', value: actualRow.llm_num_value || '—', compareValue: expectedRow.num_value || '—', highlight: true },
        { label: '单位', value: actualRow.llm_unit || '—', compareValue: expectedRow.unit || '—', highlight: true },
        { label: '分子单位', value: actualRow.llm_numerator_unit || '—', compareValue: expectedRow.numerator_unit || '—', highlight: true },
        { label: '分母单位', value: actualRow.llm_denominator_unit || '—', compareValue: expectedRow.denominator_unit || '—', highlight: true }
      ]
    };
  }

  const expected = [
    { label: '页码', value: expectedRow.pdf_numbers || '—' },
    { label: '值', value: expectedRow.num_value || '—', compareValue: actualRow.llm_num_value || '—', highlight: true },
    { label: '单位', value: expectedRow.unit || '—', compareValue: actualRow.llm_unit || '—', highlight: true }
  ];
  const actual = [
    { label: '页码', value: actualRow.llm_pdf_numbers || '—' },
    { label: '值', value: actualRow.llm_num_value || '—', compareValue: expectedRow.num_value || '—', highlight: true },
    { label: '单位', value: actualRow.llm_unit || '—', compareValue: expectedRow.unit || '—', highlight: true }
  ];

  if (hasCurrency || type === '货币型') {
    expected.push({ label: '货币', value: expectedRow.currency || '—', compareValue: actualRow.llm_currency || '—', highlight: true });
    actual.push({ label: '货币', value: actualRow.llm_currency || '—', compareValue: expectedRow.currency || '—', highlight: true });
  }

  return { expected, actual };
}

export function buildDetailRowModels(items = [], hallucinations = []) {
  const rows = [];

  for (const item of items) {
    rows.push({
      key: item.key,
      reportName: item.reportName,
      indicatorCode: item.indicatorCode,
      indicatorName: item.indicatorName,
      indicatorLabel: item.indicatorLabel,
      valueType: normalizeAnalysisValueType(item.rawValueType),
      rawValueType: item.rawValueType,
      outputCount: item.outputCount,
      bestSimilarity: item.bestSimilarity,
      bestSimilarityText: `${item.bestSimilarity}%`,
      categoryKey: item.category,
      category: CATEGORY_META[item.category]?.label || CATEGORY_META.single_fail.label,
      expectedRow: item.rows[0] || {},
      actualRow: item.bestRow || {}
    });
  }

  for (const row of hallucinations) {
    const detailType = normalizeDetailValueType(row.value_type_1 || row.value_type);
    rows.push({
      key: `hall-${row.report_name}-${row.indicator_code}-${row.llm_year}-${row.llm_text_value}-${row.llm_num_value}`,
      reportName: row.report_name || '',
      indicatorCode: row.indicator_code || '',
      indicatorName: row.llm_indicator_name || row.indicator_name || '',
      indicatorLabel: `${row.indicator_code || ''} ${row.llm_indicator_name || row.indicator_name || ''}`.trim(),
      valueType: normalizeAnalysisValueType(detailType),
      rawValueType: detailType,
      outputCount: 1,
      bestSimilarity: 0,
      bestSimilarityText: '0%',
      categoryKey: 'hallucination',
      category: CATEGORY_META.hallucination.label,
      expectedRow: { __label: '测试集', __value: '无对应测试项' },
      actualRow: row
    });
  }

  return rows;
}

export function resolveDetailFields(row) {
  if (row.categoryKey === 'hallucination') {
    const detailFields = getFieldsForRows({}, row.actualRow, row.rawValueType);
    return {
      expected: [{ label: row.expectedRow.__label || '测试集', value: row.expectedRow.__value || '无对应测试项' }],
      actual: detailFields.actual
    };
  }

  return getFieldsForRows(row.expectedRow, row.actualRow, row.rawValueType);
}

export function applyDetailFilters(rows, filters = EMPTY_DETAIL_FILTERS) {
  const similarityRange = Array.isArray(filters.similarityRange) && filters.similarityRange.length === 2
    ? filters.similarityRange
    : EMPTY_DETAIL_FILTERS.similarityRange;

  return rows.filter((row) => {
    if (filters.reportNames.length > 0 && !filters.reportNames.includes(row.reportName)) return false;
    if (filters.indicators.length > 0 && !filters.indicators.includes(row.indicatorLabel)) return false;
    if (filters.valueTypes.length > 0 && !filters.valueTypes.includes(row.valueType)) return false;
    if (filters.outputCounts.length > 0 && !filters.outputCounts.includes(String(row.outputCount))) return false;
    if (filters.similarities.length > 0 && !filters.similarities.includes(row.bestSimilarityText)) return false;
    if (row.bestSimilarity < similarityRange[0] || row.bestSimilarity > similarityRange[1]) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(row.category)) return false;
    return true;
  });
}

export function buildDetailColumnOptions(detailRows = []) {
  return {
    reportNames: unique(detailRows.map((row) => row.reportName)),
    indicators: unique(detailRows.map((row) => row.indicatorLabel)),
    valueTypes: unique(detailRows.map((row) => row.valueType)),
    similarities: unique(detailRows.map((row) => row.bestSimilarityText)),
    categories: Object.values(CATEGORY_META).map((meta) => meta.label),
    outputCounts: unique(detailRows.map((row) => String(row.outputCount)))
  };
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'zh-Hans-CN');
}

function compareNumeric(left, right) {
  return Number(left || 0) - Number(right || 0);
}

export function getNextDetailSortState(currentSort, nextKey) {
  if (!currentSort || currentSort.key !== nextKey) return { key: nextKey, direction: 'asc' };
  if (currentSort.direction === 'asc') return { key: nextKey, direction: 'desc' };
  return null;
}

export function sortDetailRows(rows = [], sortState = null) {
  if (!sortState) return rows;

  const next = [...rows];
  const factor = sortState.direction === 'asc' ? 1 : -1;

  return next.sort((left, right) => {
    let diff = 0;

    if (sortState.key === 'reportName') diff = compareText(left.reportName, right.reportName);
    else if (sortState.key === 'indicatorLabel') diff = compareText(left.indicatorLabel, right.indicatorLabel);
    else if (sortState.key === 'rawValueType') diff = compareText(left.rawValueType || left.valueType, right.rawValueType || right.valueType);
    else if (sortState.key === 'bestSimilarity') diff = compareNumeric(left.bestSimilarity, right.bestSimilarity);
    else if (sortState.key === 'category') diff = compareText(left.category, right.category);
    else if (sortState.key === 'outputCount') diff = compareNumeric(left.outputCount, right.outputCount);

    if (diff === 0) return compareText(left.key, right.key);
    return diff * factor;
  });
}

export function getDetailRowHeight(row = {}) {
  const type = normalizeDetailValueType(row.rawValueType || row.valueType);
  const hasCurrency = String(
    row.expectedRow?.currency ||
    row.actualRow?.llm_currency ||
    row.actualRow?.currency ||
    ''
  ).trim();

  if (type === '数值型' && hasCurrency) {
    return DETAIL_ROW_HEIGHTS.货币型;
  }

  return DETAIL_ROW_HEIGHTS[type] || DETAIL_ROW_HEIGHTS.文字型;
}

export function buildVirtualLayout(rows = []) {
  const heights = rows.map((row) => getDetailRowHeight(row));
  const offsets = [];
  let totalHeight = 0;

  for (const height of heights) {
    offsets.push(totalHeight);
    totalHeight += height;
  }

  return {
    heights,
    offsets,
    totalHeight
  };
}

function findIndexForOffset(layout, targetOffset) {
  const { offsets = [], heights = [] } = layout || {};
  if (!offsets.length) return -1;

  let low = 0;
  let high = offsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = offsets[mid];
    const end = start + (heights[mid] || 0);

    if (targetOffset < start) {
      high = mid - 1;
    } else if (targetOffset >= end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return Math.max(0, Math.min(offsets.length - 1, low));
}

export function getVirtualWindow({
  layout,
  viewportHeight = 0,
  scrollTop = 0,
  overscan = 1
}) {
  const itemCount = layout?.heights?.length || 0;
  if (itemCount <= 0 || viewportHeight <= 0) {
    return {
      start: 0,
      end: -1,
      offsetTop: 0,
      offsetBottom: 0
    };
  }

  const startIndex = findIndexForOffset(layout, scrollTop);
  const endIndex = findIndexForOffset(layout, scrollTop + Math.max(0, viewportHeight - 1));
  const start = Math.max(0, startIndex - overscan);
  const end = Math.min(itemCount - 1, endIndex + overscan);
  const offsetTop = layout.offsets[start] || 0;
  const offsetBottom = Math.max(0, layout.totalHeight - ((layout.offsets[end] || 0) + (layout.heights[end] || 0)));

  return {
    start,
    end,
    offsetTop,
    offsetBottom
  };
}
