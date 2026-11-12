const TYPE_ORDER = ['文字型', '数值型', '强度型'];

function formatRatioPercent(value) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}

function formatSimilarityPercent(value) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value)}%`;
}

function sanitizeFileNamePart(value) {
  return String(value || 'analysis')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'analysis';
}

function getPanelPrimaryLabel(panelNode) {
  if (!panelNode) return '名称';
  if (panelNode.section === 'cross-report' && panelNode.level === 'root') return '指标类型';
  if (panelNode.section === 'cross-report' && panelNode.level === 'valueType') return '指标';
  if (panelNode.section === 'per-report' && panelNode.level === 'root') return '报告';
  if (panelNode.section === 'per-report' && panelNode.level === 'report') return '指标类型';
  if (panelNode.section === 'per-report' && panelNode.level === 'reportType') return '指标';
  if (panelNode.section === 'per-type' && panelNode.level === 'type') return '报告';
  if (panelNode.section === 'per-type' && panelNode.level === 'typeReport') return '指标';
  return '名称';
}

function mapNodeToExportRow(node, primaryLabel) {
  const { metrics = {} } = node || {};
  return {
    [primaryLabel]: node?.label || '—',
    测试项: metrics.testItemCount ?? 0,
    输出项: metrics.modelOutputCount ?? 0,
    严格通过: formatRatioPercent(metrics.strictPassRate),
    宽松通过: formatRatioPercent(metrics.lenientPassRate),
    召回率: formatRatioPercent(metrics.recall),
    精确率: formatRatioPercent(metrics.precision),
    重复率: formatRatioPercent(metrics.duplicateRate),
    漏摘率: formatRatioPercent(metrics.missRate),
    相似度: formatSimilarityPercent(metrics.averageBestSimilarity),
    幻觉率: formatRatioPercent(metrics.hallucinationRate)
  };
}

function compareLabels(a, b) {
  return String(a?.label || '').localeCompare(String(b?.label || ''), 'zh-Hans-CN');
}

function compareMetric(key, direction, a, b) {
  const left = a?.metrics?.[key];
  const right = b?.metrics?.[key];
  const leftValue = left ?? Number.NEGATIVE_INFINITY;
  const rightValue = right ?? Number.NEGATIVE_INFINITY;
  if (leftValue === rightValue) return compareLabels(a, b);
  return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
}

export function getNextPanelSortState(currentSort, nextKey) {
  if (!currentSort || currentSort.key !== nextKey) return { key: nextKey, direction: 'asc' };
  if (currentSort.direction === 'asc') return { key: nextKey, direction: 'desc' };
  return null;
}

export function sortPanelChildren(children = [], sortState = null, type = 'report') {
  const next = [...children];

  if (!sortState) {
    if (type === 'type') {
      const order = new Map(TYPE_ORDER.map((item, index) => [item, index]));
      return next.sort((a, b) => {
        const diff = (order.get(a?.label) ?? 99) - (order.get(b?.label) ?? 99);
        return diff === 0 ? compareLabels(a, b) : diff;
      });
    }
    return next;
  }

  if (sortState.key === 'label') {
    return next.sort((a, b) => (
      sortState.direction === 'asc'
        ? compareLabels(a, b)
        : compareLabels(b, a)
    ));
  }

  return next.sort((a, b) => compareMetric(sortState.key, sortState.direction, a, b));
}

export function getRightPanelListBodyStyle({
  type = 'report',
  childCount = 0,
  treeBodyHeight = 0,
  minBodyHeight = 382,
  maxViewportHeight = Number.POSITIVE_INFINITY
} = {}) {
  if (type !== 'indicator' || childCount <= 10) return undefined;
  const resolvedHeight = Math.max(minBodyHeight, treeBodyHeight || 0);
  return {
    maxHeight: Math.min(maxViewportHeight, resolvedHeight),
    overflowY: 'auto'
  };
}

export function buildPinnedSummaryConfig(node) {
  const metrics = node?.metrics || {};

  return {
    title: node?.label || '—',
    subtitle: `输出 ${metrics.modelOutputCount ?? 0}项`,
    badges: [
      { key: 'testItemCount', text: `测试项 ${metrics.testItemCount ?? 0}`, color: 'gray' },
      { key: 'strictPassRate', text: `严格 ${formatRatioPercent(metrics.strictPassRate)}`, color: 'yellow' },
      { key: 'lenientPassRate', text: `宽松 ${formatRatioPercent(metrics.lenientPassRate)}`, color: 'yellow' },
      { key: 'recall', text: `召回 ${formatRatioPercent(metrics.recall)}`, color: 'yellow' },
      { key: 'precision', text: `精确 ${formatRatioPercent(metrics.precision)}`, color: 'yellow' },
      { key: 'duplicateRate', text: `重复 ${formatRatioPercent(metrics.duplicateRate)}`, color: 'red' },
      { key: 'missRate', text: `漏摘 ${formatRatioPercent(metrics.missRate)}`, color: 'red' },
      { key: 'averageBestSimilarity', text: `相似 ${formatSimilarityPercent(metrics.averageBestSimilarity)}`, color: 'red' },
      { key: 'hallucinationRate', text: `幻觉 ${formatRatioPercent(metrics.hallucinationRate)}`, color: 'red' }
    ]
  };
}

export function buildHallucinationToggleConfig(enabled) {
  return {
    label: '统计幻觉',
    checked: Boolean(enabled)
  };
}

export function buildAnalysisToolbarTheme() {
  return {
    cardBackground: 'linear-gradient(180deg, #f3f7fc 0%, #ffffff 100%)',
    cardBorder: '#d4deeb',
    cardShadow: '0 14px 34px rgba(15, 23, 42, 0.08)',
    toolbarBackground: 'linear-gradient(90deg, #d9e3f0 0%, #e2e9f4 52%, #eef3f9 100%)',
    toolbarBorder: '#d4deea',
    toolbarPadding: '9px 16px 8px',
    controlHeight: 36,
    actionHeight: 38,
    thresholdInputWidth: 56,
    controlBorder: '#c8d4e4',
    controlBackground: '#f9fbfe',
    controlText: '#334155',
    controlShadow: '0 4px 12px rgba(148, 163, 184, 0.08)',
    actionBackground: 'linear-gradient(135deg, #0e78d2 0%, #1489bc 100%)',
    actionShadow: '0 8px 16px rgba(14, 120, 210, 0.16)',
    structureBackground: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    structurePadding: '14px 18px 16px'
  };
}

export function buildAnalysisPanelExportPayload(panelNode) {
  const primaryLabel = getPanelPrimaryLabel(panelNode);
  const panelType = primaryLabel === '指标类型' ? 'type' : primaryLabel === '指标' ? 'indicator' : 'report';
  const sourceNodes = panelNode?.children?.length
    ? sortPanelChildren(panelNode.children, { key: 'label', direction: 'asc' }, panelType)
    : [panelNode];
  const rows = sourceNodes.filter(Boolean).map((node) => mapNodeToExportRow(node, primaryLabel));
  const date = new Date().toISOString().slice(0, 10);

  return {
    sheetName: '分析面板',
    fileName: `analysis_panel_${sanitizeFileNamePart(panelNode?.label)}_${date}.xlsx`,
    rows
  };
}
