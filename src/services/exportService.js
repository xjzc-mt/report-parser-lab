import { buildExportData, isResultFound } from '../utils/extraction.js';

export function buildExtractionSummaryRows(results = [], extractionStats = {}) {
  const resultRows = Array.isArray(results) ? results.length : 0;
  const plannedIndicators = Number(extractionStats.totalIndicators || 0);
  const completedIndicators = Number.isFinite(Number(extractionStats.completedIndicators))
    ? Number(extractionStats.completedIndicators)
    : plannedIndicators;
  const startedIndicators = Number.isFinite(Number(extractionStats.startedIndicators))
    ? Number(extractionStats.startedIndicators)
    : completedIndicators;
  const unstartedIndicators = Number.isFinite(Number(extractionStats.unstartedIndicators))
    ? Number(extractionStats.unstartedIndicators)
    : Math.max(0, plannedIndicators - startedIndicators);
  const foundIndicators = Number.isFinite(Number(extractionStats.foundIndicators))
    ? Number(extractionStats.foundIndicators)
    : (Array.isArray(results) ? results.filter(isResultFound).length : 0);
  const failedIndicators = Number(extractionStats.failedIndicators || 0);
  const plannedBatches = Number(extractionStats.totalBatches || 0);
  const executedBatches = Number.isFinite(Number(extractionStats.executedBatches))
    ? Number(extractionStats.executedBatches)
    : plannedBatches;
  const completedBatches = Number.isFinite(Number(extractionStats.completedBatches))
    ? Number(extractionStats.completedBatches)
    : executedBatches;

  return [
    ['提取摘要', ''],
    ['', ''],
    ['模型', extractionStats.model || 'N/A'],
    ['选择类型', extractionStats.selectedTypes || 'N/A'],
    ['PDF 文件数', extractionStats.totalFiles || 0],
    ['开始时间', extractionStats.startTime || 'N/A'],
    ['结束时间', extractionStats.endTime || 'N/A'],
    ['总耗时', extractionStats.duration || 'N/A'],
    ['', ''],
    ['Excel 指标总数', extractionStats.totalInputIndicators || 0],
    ['计划指标数（过滤后）', plannedIndicators],
    ['已处理指标数', completedIndicators],
    ['已启动指标数', startedIndicators],
    ['未运行指标数', unstartedIndicators],
    ['已找到指标数', foundIndicators],
    ['已处理指标中未找到', Math.max(0, completedIndicators - foundIndicators)],
    ['失败指标数', failedIndicators],
    ['失败文件数', extractionStats.failedFiles || 0],
    ['结果行数', resultRows],
    ['  - 计划文字型', extractionStats.textCount || 0],
    ['  - 计划数值型', extractionStats.numericCount || 0],
    ['  - 计划强度型', extractionStats.intensityCount || 0],
    ['  - 计划货币型', extractionStats.currencyCount || 0],
    ['', ''],
    ['计划批次数', plannedBatches],
    ['已执行批次数', executedBatches],
    ['已完成批次数', completedBatches],
    ['  - 计划文字型批次', extractionStats.textBatches || 0],
    ['  - 计划数值型批次', extractionStats.numericBatches || 0],
    ['  - 计划强度型批次', extractionStats.intensityBatches || 0],
    ['  - 计划货币型批次', extractionStats.currencyBatches || 0],
    ['', ''],
    ['输入 Token', extractionStats.totalInputTokens || 0],
    ['输出 Token', extractionStats.totalOutputTokens || 0],
    ['总 Token', (extractionStats.totalInputTokens || 0) + (extractionStats.totalOutputTokens || 0)],
    ['预估成本（USD）', `$${(extractionStats.totalCost || 0).toFixed(4)}`]
  ];
}

export async function exportResultsToExcel(results, extractionStats) {
  const XLSX = await import('xlsx');
  const exportData = buildExportData(results);

  if (exportData.length === 0) {
    window.alert('没有可导出的有效结果。');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(exportData, { cellDates: true });
  const range = XLSX.utils.decode_range(worksheet['!ref']);

  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
    if (worksheet[cellRef]) {
      worksheet[cellRef].t = 's';
      worksheet[cellRef].z = '@';
    }
  }

  const summaryData = buildExtractionSummaryRows(results, extractionStats);

  const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWorksheet['!cols'] = [{ wch: 28 }, { wch: 35 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '结果');
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, '摘要');
  XLSX.writeFile(workbook, `extraction_results_${new Date().toISOString().split('T')[0]}.xlsx`);
}
