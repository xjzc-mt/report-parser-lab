import { buildAnalysisPanelExportPayload } from '../utils/unifiedAnalysisPanel.js';

export async function exportAnalysisPanelToExcel(panelNode) {
  const payload = buildAnalysisPanelExportPayload(panelNode);

  if (!payload.rows.length) {
    window.alert('当前分析面板暂无可导出的数据。');
    return;
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(payload.rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, payload.sheetName);
  XLSX.writeFile(workbook, payload.fileName);
}
