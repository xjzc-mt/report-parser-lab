import {
  buildAnalysisV2Index,
  buildAnalysisV2Model,
  getAnalysisSubsetFromIndex,
  normalizeAnalysisValueType,
  summarizeAnalysisSubset
} from './analysisV2Metrics.js';

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function summarizeMergedNode(items = [], hallucinations = []) {
  return summarizeAnalysisSubset(items, hallucinations);
}

function makeNode({ id, section, level, label, items = [], hallucinations = [], children = [], filters = {} }) {
  return {
    id,
    section,
    level,
    label,
    items,
    hallucinations,
    children,
    filters,
    metrics: summarizeMergedNode(items, hallucinations)
  };
}

function indicatorLabel(item) {
  return item.indicatorLabel || `${item.indicatorCode || ''} ${item.indicatorName || ''}`.trim();
}

function hallucinationLabel(row) {
  return `${String(row.indicator_code || '').trim()} ${String(row.llm_indicator_name || row.indicator_name || '').trim()}`.trim();
}

function buildIndicatorNodes(items, hallucinations, section, levelPrefix, baseFilters = {}) {
  const indicatorMap = new Map();

  for (const item of items) {
    const label = indicatorLabel(item);
    if (!indicatorMap.has(label)) indicatorMap.set(label, []);
    indicatorMap.get(label).push(item);
  }
  // 仅存在于幻觉输出的指标也要有可定位、可导出的节点。
  for (const row of hallucinations) {
    const label = hallucinationLabel(row);
    if (!indicatorMap.has(label)) indicatorMap.set(label, []);
  }

  return Array.from(indicatorMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([label, groupedItems]) => {
      const nodeHallucinations = hallucinations.filter((row) => hallucinationLabel(row) === label);
      return makeNode({
        id: `${levelPrefix}_${label}`,
        section,
        level: 'indicator',
        label,
        items: groupedItems,
        hallucinations: nodeHallucinations,
        filters: {
          ...baseFilters,
          indicators: [label]
        }
      });
    });
}

const VALUE_TYPE_ORDER = ['文字型', '数值型', '强度型'];

function sortValueTypes(keys) {
  return [...keys].sort((a, b) => {
    const left = VALUE_TYPE_ORDER.indexOf(a);
    const right = VALUE_TYPE_ORDER.indexOf(b);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right)
      || String(a).localeCompare(String(b), 'zh-Hans-CN');
  });
}

function hallucinationType(row) {
  return normalizeAnalysisValueType(row.value_type_1 || row.value_type);
}

function hallucinationReport(row) {
  return String(row.report_name || '').trim() || '未命名报告';
}

function buildCrossReportRoot(model) {
  const typeItems = new Map(model.overviews.byType.map((group) => [group.key, group.items]));
  const typeKeys = new Set([
    ...typeItems.keys(),
    ...model.hallucinations.map(hallucinationType)
  ]);
  const typeNodes = sortValueTypes(typeKeys).map((valueType) => {
    const items = typeItems.get(valueType) || [];
    const nodeHallucinations = model.hallucinations.filter((row) => hallucinationType(row) === valueType);

    return makeNode({
      id: `cross_type_${valueType}`,
      section: 'cross-report',
      level: 'valueType',
      label: valueType,
      items,
      hallucinations: nodeHallucinations,
      children: buildIndicatorNodes(
        items,
        nodeHallucinations,
        'cross-report',
        `cross_type_${valueType}`,
        { valueTypes: [valueType] }
      ),
      filters: { valueTypes: [valueType] }
    });
  });

  return makeNode({
    id: 'cross_root',
    section: 'cross-report',
    level: 'root',
    label: '全部报告',
    items: model.testItems,
    hallucinations: model.hallucinations,
    children: typeNodes
  });
}

function buildPerReportRoot(model) {
  const reportItems = new Map(
    model.overviews.byReport
      .filter((group) => group.key !== '全部报告')
      .map((group) => [group.key, group.items])
  );
  const reportKeys = new Set([
    ...reportItems.keys(),
    ...model.hallucinations.map(hallucinationReport)
  ]);

  const reportNodes = Array.from(reportKeys)
    .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'))
    .map((reportName) => {
      const items = reportItems.get(reportName) || [];
      const reportHallucinations = model.hallucinations.filter((row) => hallucinationReport(row) === reportName);
      const typeMap = new Map();
      for (const item of items) {
        if (!typeMap.has(item.valueType)) typeMap.set(item.valueType, []);
        typeMap.get(item.valueType).push(item);
      }
      for (const row of reportHallucinations) {
        const valueType = hallucinationType(row);
        if (!typeMap.has(valueType)) typeMap.set(valueType, []);
      }

      const typeNodes = sortValueTypes(typeMap.keys()).map((valueType) => {
        const typeItems = typeMap.get(valueType) || [];
        const typeHallucinations = reportHallucinations.filter((row) => hallucinationType(row) === valueType);

        return makeNode({
          id: `report_${reportName}_type_${valueType}`,
          section: 'per-report',
          level: 'reportType',
          label: valueType,
          items: typeItems,
          hallucinations: typeHallucinations,
          children: buildIndicatorNodes(
            typeItems,
            typeHallucinations,
            'per-report',
            `report_${reportName}_type_${valueType}`,
            {
              reportNames: [reportName],
              valueTypes: [valueType]
            }
          ),
          filters: {
            reportNames: [reportName],
            valueTypes: [valueType]
          }
        });
      });

      return makeNode({
        id: `report_${reportName}`,
        section: 'per-report',
        level: 'report',
        label: reportName,
        items,
        hallucinations: reportHallucinations,
        children: typeNodes,
        filters: {
          reportNames: [reportName]
        }
      });
    });

  return makeNode({
    id: 'per_report_root',
    section: 'per-report',
    level: 'root',
    label: '全部指标',
    items: model.testItems,
    hallucinations: model.hallucinations,
    children: reportNodes
  });
}

function buildPerTypeRoot(model) {
  const typeItems = new Map(model.overviews.byType.map((group) => [group.key, group.items]));
  const typeKeys = new Set([
    ...typeItems.keys(),
    ...model.hallucinations.map(hallucinationType)
  ]);
  const typeNodes = sortValueTypes(typeKeys).map((valueType) => {
    const items = typeItems.get(valueType) || [];
    const typeHallucinations = model.hallucinations.filter((row) => hallucinationType(row) === valueType);
    const reportMap = new Map();
    for (const item of items) {
      const reportName = item.reportName || '未命名报告';
      if (!reportMap.has(reportName)) reportMap.set(reportName, []);
      reportMap.get(reportName).push(item);
    }
    for (const row of typeHallucinations) {
      const reportName = hallucinationReport(row);
      if (!reportMap.has(reportName)) reportMap.set(reportName, []);
    }

    const reportNodes = Array.from(reportMap.keys())
      .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'))
      .map((reportName) => {
        const reportItems = reportMap.get(reportName) || [];
        const reportHallucinations = typeHallucinations.filter((row) => hallucinationReport(row) === reportName);
        return makeNode({
          id: `type_${valueType}_report_${reportName}`,
          section: 'per-type',
          level: 'typeReport',
          label: reportName,
          items: reportItems,
          hallucinations: reportHallucinations,
          children: buildIndicatorNodes(
            reportItems,
            reportHallucinations,
            'per-type',
            `type_${valueType}_report_${reportName}`,
            {
              reportNames: [reportName],
              valueTypes: [valueType]
            }
          ),
          filters: {
            reportNames: [reportName],
            valueTypes: [valueType]
          }
        });
      });

    return makeNode({
      id: `type_${valueType}`,
      section: 'per-type',
      level: 'type',
      label: valueType,
      items,
      hallucinations: typeHallucinations,
      children: reportNodes,
      filters: {
        valueTypes: [valueType]
      }
    });
  });

  return makeNode({
    id: 'per_type_root',
    section: 'per-type',
    level: 'root',
    label: '全部指标',
    items: model.testItems,
    hallucinations: model.hallucinations,
    children: typeNodes
  });
}

function buildLookupMaps(roots = []) {
  const nodeMap = new Map();
  const pathMap = new Map();

  const visit = (node, parentPath = []) => {
    const nextPath = [...parentPath, node];
    nodeMap.set(node.id, node);
    pathMap.set(node.id, nextPath);
    for (const child of node.children || []) {
      visit(child, nextPath);
    }
  };

  roots.forEach((root) => visit(root));

  return { nodeMap, pathMap };
}

export function buildMergedTreeData(source = [], threshold = 70, includeHallucination = true, selectedYears = []) {
  const index = Array.isArray(source) ? buildAnalysisV2Index(source) : source;
  const subset = getAnalysisSubsetFromIndex(index, selectedYears);
  const model = buildAnalysisV2Model(subset, threshold);

  if (!includeHallucination) {
    model.hallucinations = [];
  }

  const crossReportRoot = buildCrossReportRoot(model);
  const perReportRoot = buildPerReportRoot(model);
  const perTypeRoot = buildPerTypeRoot(model);
  const { nodeMap, pathMap } = buildLookupMaps([crossReportRoot, perReportRoot, perTypeRoot]);

  return {
    crossReportRoot,
    perReportRoot,
    perTypeRoot,
    nodeMap,
    pathMap
  };
}

export function buildPathFilters(nodePath = []) {
  const merged = {
    reportNames: [],
    indicators: [],
    valueTypes: [],
    outputCounts: [],
    similarities: [],
    categories: []
  };

  for (const node of nodePath) {
    if (!node?.filters) continue;
    merged.reportNames.push(...(node.filters.reportNames || []));
    merged.indicators.push(...(node.filters.indicators || []));
    merged.valueTypes.push(...(node.filters.valueTypes || []));
    merged.outputCounts.push(...(node.filters.outputCounts || []));
    merged.similarities.push(...(node.filters.similarities || []));
    merged.categories.push(...(node.filters.categories || []));
  }

  return {
    reportNames: unique(merged.reportNames),
    indicators: unique(merged.indicators),
    valueTypes: unique(merged.valueTypes),
    outputCounts: unique(merged.outputCounts),
    similarities: unique(merged.similarities),
    categories: unique(merged.categories)
  };
}
