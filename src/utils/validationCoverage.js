function getTestItemKey(row) {
  if (!row || row.match_status === '幻觉') return '';
  const explicit = String(row.test_item_key || '').trim();
  if (explicit) return explicit;
  const report = String(row.report_name || '').trim();
  const code = String(row.indicator_code || '').trim();
  const year = String(row.data_year || '').trim();
  if (!report && !code && !year) return '';
  return `${report}|||${code}|||${year}`;
}

function countUniqueTestItems(rows = []) {
  return new Set(rows.map(getTestItemKey).filter(Boolean)).size;
}

export function buildValidationCoverage(testSetRows = [], validRows = [], invalidRows = [], associationTestItemKeys = []) {
  const testRowCount = testSetRows.length;
  const testItemCount = associationTestItemKeys.length > 0
    ? new Set(associationTestItemKeys.filter(Boolean)).size
    : countUniqueTestItems(testSetRows);
  const validTestItemCount = countUniqueTestItems(validRows);
  const invalidTestItemCount = countUniqueTestItems(invalidRows);
  const excludedTestItemCount = Math.max(0, testItemCount - validTestItemCount);
  const modelResultRowCount = validRows.filter((row) => row.match_status !== '未匹配').length;
  const hallucinationRowCount = validRows.filter((row) => row.match_status === '幻觉').length;
  const duplicateOutputRowCount = validRows.filter((row) => row.match_status === '多结果').length;
  const unmatchedTestItemCount = validRows.filter((row) => row.match_status === '未匹配').length;

  return {
    testRowCount,
    testItemCount: testItemCount || testRowCount,
    validTestItemCount,
    invalidTestItemCount,
    excludedTestItemCount,
    // 保留旧字段名只用于兼容已保存的覆盖信息；新提示不再用行数作测试项分母。
    invalidCount: excludedTestItemCount,
    validComparisonRowCount: validRows.length,
    modelResultRowCount,
    duplicateOutputRowCount,
    hallucinationRowCount,
    unmatchedTestItemCount,
    invalidRows
  };
}

export function normalizeValidationCoverage(coverage, savedRows = []) {
  if (!coverage) return null;
  if (coverage.testItemCount !== undefined && coverage.excludedTestItemCount !== undefined) {
    return coverage;
  }

  // W2 之前的缓存只保存了比较行数，不能把旧 validCount 当作测试项数。
  // 优先用缓存中的比较行重建测试项身份；没有行数据时明确要求重新分析。
  const validRows = Array.isArray(savedRows) ? savedRows : [];
  const invalidRows = Array.isArray(coverage.invalidRows) ? coverage.invalidRows : [];
  if (validRows.length === 0 && invalidRows.length === 0) {
    return { ...coverage, needsReanalysis: true };
  }

  const rebuilt = buildValidationCoverage(
    [...validRows, ...invalidRows],
    validRows,
    invalidRows
  );
  if (rebuilt.testItemCount === 0) {
    return { ...coverage, needsReanalysis: true };
  }
  return {
    ...rebuilt,
    testRowCount: Number(coverage.rawCount || coverage.testRowCount || rebuilt.testRowCount),
    invalidRows
  };
}
