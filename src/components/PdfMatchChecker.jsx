export function PdfMatchChecker({ requiredReports, uploadedPdfFiles, onPdfUpload }) {
  const matched = [];
  const missing = [];

  for (const reportName of requiredReports) {
    const pdfFile = uploadedPdfFiles.find(f => f.name.replace(/\.[^/.]+$/, '') === reportName);
    if (pdfFile) {
      matched.push(reportName);
    } else {
      missing.push(reportName);
    }
  }

  const coverage = requiredReports.length > 0 ? matched.length / requiredReports.length : 0;

  return (
    <div style={{ marginTop: 20, padding: 15, border: '1px solid #ddd', borderRadius: 8 }}>
      <h4>📊 PDF 匹配检查</h4>
      <div>覆盖率: {Math.round(coverage * 100)}%</div>
      <div style={{ marginTop: 10 }}>
        {matched.map(name => (
          <div key={name} style={{ color: 'green' }}>✓ {name}</div>
        ))}
        {missing.map(name => (
          <div key={name} style={{ color: 'red' }}>✗ {name} - 缺失</div>
        ))}
      </div>
      {missing.length > 0 && (
        <div style={{ marginTop: 10, color: 'orange' }}>
          ⚠️ 缺失的 PDF 对应行将跳过优化
        </div>
      )}
    </div>
  );
}
