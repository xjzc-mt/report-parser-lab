const TYPE_ORDER = ['文字型', '数值型', '强度型'];

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function sortText(values = []) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'));
}

function addToGroupedMap(groupMap, key, value) {
  if (!key) return;
  if (!groupMap.has(key)) groupMap.set(key, []);
  groupMap.get(key).push(value);
}

function isAnalysisIndex(source) {
  return Boolean(source && source.kind === 'analysis-v2-index');
}

function isAnalysisSubset(source) {
  return Boolean(source && source.kind === 'analysis-v2-subset');
}

export function normalizeAnalysisValueType(rawValueType) {
  const value = String(rawValueType || '').trim();
  const upper = value.toUpperCase();
  if (!value) return '文字型';
  if (value.includes('文字') || value.includes('文本') || upper.includes('TEXT')) return '文字型';
  if (value.includes('强度') || upper.includes('INTENSITY')) return '强度型';
  if (value.includes('货币') || value.includes('数值') || value.includes('数字') || upper.includes('NUMERIC') || upper.includes('CURRENCY')) {
    return '数值型';
  }
  return '文字型';
}

export function normalizeDetailValueType(rawValueType) {
  const value = String(rawValueType || '').trim();
  const upper = value.toUpperCase();
  if (!value) return '文字型';
  if (value.includes('文字') || value.includes('文本') || upper.includes('TEXT')) return '文字型';
  if (value.includes('强度') || upper.includes('INTENSITY')) return '强度型';
  if (value.includes('货币') || upper.includes('CURRENCY')) return '货币型';
  if (value.includes('数值') || value.includes('数字') || upper.includes('NUMERIC')) return '数值型';
  return '文字型';
}

function buildBaseItems(comparisonRows = []) {
  const testItemMap = new Map();
  const hallucinations = [];
  const itemsByYear = new Map();
  const hallucinationsByYear = new Map();
  const itemsWithoutYear = [];
  const hallucinationsWithoutYear = [];
  const yearSet = new Set();

  for (const row of comparisonRows) {
    if (row.match_status === '幻觉') {
      hallucinations.push(row);
      const hallucinationYear = String(row.llm_year || row.data_year || '').trim();
      if (hallucinationYear) {
        yearSet.add(hallucinationYear);
        addToGroupedMap(hallucinationsByYear, hallucinationYear, row);
      } else {
        hallucinationsWithoutYear.push(row);
      }
      continue;
    }

    const reportName = String(row.report_name || '').trim();
    const indicatorCode = String(row.indicator_code || '').trim();
    const year = String(row.data_year || '').trim();
    // 自定义关联时 report_name/indicator/year 可能相同，必须优先使用关联阶段生成的身份；
    // 旧缓存没有 test_item_key 时回退到原来的展示字段组合。
    const key = String(row.test_item_key || '').trim()
      || `${reportName}|||${indicatorCode}|||${year}`;

    if (!testItemMap.has(key)) {
      testItemMap.set(key, {
        key,
        reportName,
        indicatorCode,
        indicatorName: String(row.indicator_name || '').trim(),
        indicatorLabel: `${String(row.indicator_code || '').trim()} ${String(row.indicator_name || '').trim()}`.trim(),
        dataYear: year,
        valueType: normalizeAnalysisValueType(row.value_type_1 || row.value_type),
        rawValueType: normalizeDetailValueType(row.value_type_1 || row.value_type),
        rows: []
      });
    }

    testItemMap.get(key).rows.push(row);
  }

  const baseItems = Array.from(testItemMap.values()).map((item) => {
    const outputRows = item.rows.filter((row) => row.match_status !== '未匹配');
    const outputCount = outputRows.length;
    const bestRow = outputRows.reduce((best, row) => {
      if (!best) return row;
      return (row.similarity ?? 0) > (best.similarity ?? 0) ? row : best;
    }, null);
    const baseItem = {
      ...item,
      outputRows,
      outputCount,
      bestRow,
      bestSimilarity: bestRow ? Number(bestRow.similarity ?? 0) : 0,
      hit: outputCount > 0,
      duplicate: outputCount > 1,
      miss: outputCount === 0
    };

    if (baseItem.dataYear) {
      yearSet.add(baseItem.dataYear);
      addToGroupedMap(itemsByYear, baseItem.dataYear, baseItem);
    } else {
      itemsWithoutYear.push(baseItem);
    }

    return baseItem;
  });

  return {
    baseItems,
    hallucinations,
    itemsByYear,
    hallucinationsByYear,
    itemsWithoutYear,
    hallucinationsWithoutYear,
    allYears: sortText(Array.from(yearSet))
  };
}

function evaluateTestItems(baseItems = [], threshold = 70) {
  return baseItems.map((item) => {
    const hasPass = item.outputRows.some((row) => Number(row.similarity ?? 0) >= threshold);
    const strictPass = item.outputCount === 1 && hasPass;
    const lenientPass = hasPass;

    let category = 'single_fail';
    if (item.miss) category = 'miss';
    else if (item.duplicate && hasPass) category = 'duplicate_with_pass';
    else if (item.duplicate && !hasPass) category = 'duplicate_without_pass';
    else if (strictPass && item.bestSimilarity === 100) category = 'perfect_match';
    else if (strictPass) category = 'pass_match';

    return {
      ...item,
      hasPass,
      strictPass,
      lenientPass,
      category
    };
  });
}

export function summarizeAnalysisSubset(testItems, hallucinations = []) {
  const testItemCount = testItems.length;
  const modelOutputCount = testItems.reduce((sum, item) => sum + item.outputCount, 0) + hallucinations.length;
  const strictPassCount = testItems.filter((item) => item.strictPass).length;
  const lenientPassCount = testItems.filter((item) => item.lenientPass).length;
  const hitCount = testItems.filter((item) => item.hit).length;
  const duplicateCount = testItems.filter((item) => item.duplicate).length;
  const missCount = testItems.filter((item) => item.miss).length;
  const hallucinationCount = hallucinations.length;

  const categoryBreakdown = {
    perfect_match: testItems.filter((item) => item.category === 'perfect_match').length,
    pass_match: testItems.filter((item) => item.category === 'pass_match').length,
    single_fail: testItems.filter((item) => item.category === 'single_fail').length,
    duplicate_with_pass: testItems.filter((item) => item.category === 'duplicate_with_pass').length,
    duplicate_without_pass: testItems.filter((item) => item.category === 'duplicate_without_pass').length,
    miss: testItems.filter((item) => item.category === 'miss').length,
    hallucination: hallucinationCount
  };

  return {
    testItemCount,
    modelOutputCount,
    strictPassCount,
    lenientPassCount,
    hitCount,
    duplicateCount,
    missCount,
    hallucinationCount,
    strictPassRate: ratio(strictPassCount, testItemCount),
    lenientPassRate: ratio(lenientPassCount, testItemCount),
    recall: ratio(hitCount, testItemCount),
    precision: modelOutputCount ? (lenientPassCount / modelOutputCount) : 0,
    duplicateRate: ratio(duplicateCount, testItemCount),
    missRate: ratio(missCount, testItemCount),
    hallucinationRate: modelOutputCount ? (hallucinationCount / modelOutputCount) : 0,
    averageBestSimilarity: average(testItems.map((item) => item.bestSimilarity)),
    categoryBreakdown
  };
}

function buildOverviewList(testItems, groupBy) {
  const groupMap = new Map();

  for (const item of testItems) {
    const key = groupBy(item);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(item);
  }

  return Array.from(groupMap.entries()).map(([key, items]) => ({
    key,
    items,
    summary: summarizeAnalysisSubset(items, [])
  }));
}

function sortByTypeOrder(groups) {
  const order = new Map(TYPE_ORDER.map((type, index) => [type, index]));
  return [...groups].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
}

function sortByLabel(groups) {
  return [...groups].sort((a, b) => String(a.key).localeCompare(String(b.key), 'zh-Hans-CN'));
}

export function buildAnalysisV2Index(comparisonRows = []) {
  const base = buildBaseItems(comparisonRows);
  return {
    kind: 'analysis-v2-index',
    ...base
  };
}

export function getAnalysisSubsetFromIndex(index, selectedYears = []) {
  if (!isAnalysisIndex(index)) {
    return {
      kind: 'analysis-v2-subset',
      baseItems: [],
      hallucinations: []
    };
  }

  if (!selectedYears.length) {
    return {
      kind: 'analysis-v2-subset',
      baseItems: index.baseItems,
      hallucinations: index.hallucinations
    };
  }

  const baseItems = [];
  const hallucinations = [...index.hallucinationsWithoutYear];
  const seenBaseKeys = new Set();
  for (const item of index.itemsWithoutYear || []) {
    if (!seenBaseKeys.has(item.key)) {
      baseItems.push(item);
      seenBaseKeys.add(item.key);
    }
  }
  const selectedYearSet = new Set(selectedYears);

  for (const year of selectedYearSet) {
    for (const item of index.itemsByYear.get(year) || []) {
      if (!seenBaseKeys.has(item.key)) {
        baseItems.push(item);
        seenBaseKeys.add(item.key);
      }
    }
    hallucinations.push(...(index.hallucinationsByYear.get(year) || []));
  }

  return {
    kind: 'analysis-v2-subset',
    baseItems,
    hallucinations
  };
}

function normalizeAnalysisSource(source) {
  if (isAnalysisIndex(source)) {
    return getAnalysisSubsetFromIndex(source);
  }

  if (isAnalysisSubset(source)) {
    return source;
  }

  return getAnalysisSubsetFromIndex(buildAnalysisV2Index(source));
}

export function buildAnalysisV2Model(source = [], threshold = 70) {
  const { baseItems, hallucinations } = normalizeAnalysisSource(source);
  const testItems = evaluateTestItems(baseItems, threshold);
  const byType = sortByTypeOrder(buildOverviewList(testItems, (item) => item.valueType));
  const byReport = [
    {
      key: '全部报告',
      items: testItems,
      summary: summarizeAnalysisSubset(testItems, hallucinations),
      hallucinations
    },
    ...sortByLabel(buildOverviewList(testItems, (item) => item.reportName || '未命名报告')).map((group) => ({
      ...group,
      hallucinations: hallucinations.filter((row) => String(row.report_name || '').trim() === group.key)
    }))
  ];
  const byYear = sortByLabel(buildOverviewList(testItems, (item) => item.dataYear || '未知年份'));
  const byIndicator = [
    {
      key: '全部指标',
      items: testItems,
      summary: summarizeAnalysisSubset(testItems, hallucinations),
      hallucinations
    },
    ...sortByLabel(buildOverviewList(testItems, (item) => item.indicatorLabel || item.indicatorCode || '未命名指标')).map((group) => ({
      ...group,
      indicatorCode: group.items[0]?.indicatorCode || '',
      indicatorName: group.items[0]?.indicatorName || '',
      hallucinations: hallucinations.filter((row) => `${String(row.indicator_code || '').trim()} ${String(row.llm_indicator_name || row.indicator_name || '').trim()}`.trim() === group.key)
    }))
  ];

  const reportTypeMatrix = [];
  for (const reportGroup of byReport) {
    for (const valueType of TYPE_ORDER) {
      const items = reportGroup.items.filter((item) => item.valueType === valueType);
      if (!items.length) continue;
      reportTypeMatrix.push({
        reportName: reportGroup.key,
        valueType,
        items,
        summary: summarizeAnalysisSubset(
          items,
          reportGroup.key === '全部报告'
            ? hallucinations.filter((row) => normalizeAnalysisValueType(row.value_type_1 || row.value_type) === valueType)
            : hallucinations.filter((row) => String(row.report_name || '').trim() === reportGroup.key && normalizeAnalysisValueType(row.value_type_1 || row.value_type) === valueType)
        )
      });
    }
  }

  const indicatorTypeMatrix = [];
  for (const indicatorGroup of byIndicator) {
    for (const valueType of TYPE_ORDER) {
      const items = indicatorGroup.items.filter((item) => item.valueType === valueType);
      if (!items.length) continue;
      indicatorTypeMatrix.push({
        indicatorLabel: indicatorGroup.key,
        indicatorCode: indicatorGroup.indicatorCode || '',
        indicatorName: indicatorGroup.indicatorName || '',
        valueType,
        items,
        summary: summarizeAnalysisSubset(
          items,
          indicatorGroup.key === '全部指标'
            ? hallucinations.filter((row) => normalizeAnalysisValueType(row.value_type_1 || row.value_type) === valueType)
            : hallucinations.filter((row) => {
                const label = `${String(row.indicator_code || '').trim()} ${String(row.llm_indicator_name || row.indicator_name || '').trim()}`.trim();
                return label === indicatorGroup.key && normalizeAnalysisValueType(row.value_type_1 || row.value_type) === valueType;
              })
        )
      });
    }
  }

  return {
    testItems,
    hallucinations,
    summary: summarizeAnalysisSubset(testItems, hallucinations),
    overviews: {
      byType,
      byReport,
      byYear,
      byIndicator,
      reportTypeMatrix,
      indicatorTypeMatrix
    }
  };
}
