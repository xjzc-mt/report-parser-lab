import { Badge, Button, NumberInput, Progress, Text } from '@mantine/core';
import { IconFileTypePdf, IconSparkles, IconTableImport } from '@tabler/icons-react';
import { UploadCard } from '../UploadCard.jsx';
import { PdfMatchChecker } from '../PdfMatchChecker.jsx';

function formatExcelFile(file) {
  if (!file) return '';
  return `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
}

function formatPdfFiles(files) {
  if (!files || files.length === 0) return '';
  return `${files.length} 个文件`;
}

function formatPhaseLabel(phase) {
  switch (phase) {
    case 'initializing':
      return '准备中';
    case 'diagnosis':
      return '诊断';
    case 'candidate_generation':
      return '候选生成';
    case 'evaluation':
      return '验证重跑';
    case 'validation_review':
      return '验证评审';
    case 'threshold_reached':
      return '达到阈值';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return phase || '-';
  }
}

function formatStatusLabel(status) {
  switch (status) {
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'stopped':
      return '已停止';
    case 'error':
      return '失败';
    default:
      return status || '-';
  }
}

export function OptimizationSetupPanel({
  comparisonFile,
  pdfFiles,
  onComparisonFileSelect,
  onComparisonFileRemove,
  onPdfSelect,
  onPdfRemove,
  requiredReports,
  indicatorCatalog,
  selectionSummary,
  onOpenTargetPicker,
  maxIterations,
  onMaxIterationsChange,
  targetScoreThreshold,
  onTargetScoreThresholdChange,
  selectedIndicatorCount,
  selectedRowCount,
  totalRowCount,
  baselineSummary,
  onOpenPromptAssetLibrary,
  strategy,
  canOptimize,
  isOptimizing,
  progressState,
  onStartOptimization,
  error
}) {
  return (
    <div className="prompt-optimization-setup">
      <div className="testbench-upload-grid">
        <UploadCard
          icon={<IconTableImport size={26} stroke={1.8} />}
          tag="EXCEL"
          title="关联对比文件"
          hint="上传模型结果与测试集关联后的对比文件"
          acceptHint="必须包含 indicator_code、report_name、prompt、pdf_numbers 等字段"
          buttonLabel="选择对比文件"
          accept=".xlsx,.xls,.csv"
          file={comparisonFile}
          onFileSelect={onComparisonFileSelect}
          onRemoveFile={onComparisonFileRemove}
          formatFileInfo={formatExcelFile}
        />
        <UploadCard
          icon={<IconFileTypePdf size={26} stroke={1.8} />}
          tag="PDF"
          title="PDF 文件"
          hint="上传该目标对应报告的 PDF"
          buttonLabel="选择 PDF 文件"
          accept="application/pdf"
          file={pdfFiles}
          multiple
          onFileSelect={onPdfSelect}
          onRemoveFile={onPdfRemove}
          formatFileInfo={formatPdfFiles}
        />
      </div>

      {requiredReports.length > 0 ? (
        <PdfMatchChecker
          requiredReports={requiredReports}
          uploadedPdfFiles={pdfFiles}
        />
      ) : null}

      <div className={`prompt-optimization-banner ${baselineSummary?.missingCount ? 'prompt-optimization-banner-warning' : ''}`}>
        <Text size="xs" fw={600} c={baselineSummary?.missingCount ? 'red.6' : 'blue.7'} mb={4}>
          基线 Prompt 来源
        </Text>
        <div className="prompt-optimization-badge-row">
          <Badge size="xs" color="teal" variant="light">资产库 {baselineSummary?.libraryCount ?? 0}</Badge>
          <Badge size="xs" color="yellow" variant="light">对比文件快照 {baselineSummary?.comparisonCount ?? 0}</Badge>
          <Badge size="xs" color={baselineSummary?.missingCount ? 'red' : 'gray'} variant="light">缺少基线 {baselineSummary?.missingCount ?? 0}</Badge>
        </div>
        <Text size="xs" c="dimmed" mt={4}>
          当前会优先使用 Prompt 资产库中的最新版本作为基线；没有资产版本时，才会回退使用关联对比文件里的 Prompt 快照。
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          当前自动优化只会改写用户提示词；系统提示词沿用平台固定抽取规则，不在这里改写。
        </Text>
        {baselineSummary?.previewPrompt ? (
          <Text size="xs" c="dimmed" mt={4}>
            Prompt 预览：{String(baselineSummary.previewPrompt).slice(0, 120)}{String(baselineSummary.previewPrompt).length > 120 ? '...' : ''}
          </Text>
        ) : null}
        {baselineSummary?.missingTargets?.length ? (
          <Text size="xs" c="red.3" mt={4}>
            缺少基线：{baselineSummary.missingTargets.map((item) => `${item.code} ${item.name}`).join('，')}
          </Text>
        ) : null}
        {onOpenPromptAssetLibrary && baselineSummary?.hasNonLibraryTarget ? (
          <div style={{ marginTop: 10 }}>
            <Button variant="default" radius="xl" size="xs" onClick={onOpenPromptAssetLibrary}>
              打开 Prompt 资产库
            </Button>
          </div>
        ) : null}
      </div>

      <div className="prompt-optimization-banner">
        <Text size="xs" fw={600} c="blue.7" mb={4}>
          当前优化链路
        </Text>
        <div className="prompt-optimization-badge-row">
          <Badge size="xs" color="indigo" variant="light">
            训练样本 {strategy?.trainingLimit ?? '-'}
          </Badge>
          <Badge size="xs" color="grape" variant="light">
            验证样本 {strategy?.validationLimit ?? '-'}
          </Badge>
          <Badge size="xs" color="blue" variant="light">
            页码扩窗 ±{strategy?.windowRadius ?? 0}
          </Badge>
        </div>
        <Text size="xs" c="dimmed" mt={4}>
          优化页会按“诊断 → 候选生成 → 验证重跑 → 验证评审”的流水线执行。训练样本用于找问题并生成候选，验证样本用于复跑打分。策略模板在右侧面板统一维护。
        </Text>
      </div>

      <div className="prompt-optimization-target-selector">
        <div className="prompt-optimization-target-selector-head">
          <div>
            <strong>优化指标</strong>
            <Text size="xs" c="dimmed">
              当前页面只保留已选摘要，长列表统一在弹窗里调整。
            </Text>
          </div>
        </div>
        {!indicatorCatalog.length ? (
          <div className="prompt-optimization-empty">先上传关联对比文件，才能选择优化指标。</div>
        ) : (
          <div className="prompt-optimization-selection-summary">
            <div className="prompt-optimization-selection-summary-head">
              <div className="prompt-optimization-summary-strip">
                <Badge variant="light" color="blue" radius="xl">
                  已选 {selectionSummary?.selectedCount ?? 0} 个指标
                </Badge>
                <Badge variant="light" color="cyan" radius="xl">
                  覆盖 {selectionSummary?.selectedRowCount ?? 0} 条样本
                </Badge>
                {(selectionSummary?.typeBreakdown || []).map((item) => (
                  <Badge key={item.type} variant="light" color="grape" radius="xl">
                    {item.type} {item.count}
                  </Badge>
                ))}
              </div>
              <Button
                variant="default"
                radius="xl"
                size="xs"
                onClick={onOpenTargetPicker}
                disabled={!indicatorCatalog.length}
              >
                调整指标
              </Button>
            </div>
            {(selectionSummary?.previewLabels || []).length ? (
              <div className="prompt-optimization-selection-preview">
                {(selectionSummary.previewLabels || []).map((label) => (
                  <span key={label}>{label}</span>
                ))}
                {(selectionSummary?.selectedCount || 0) > (selectionSummary?.previewLabels || []).length ? (
                  <span>……</span>
                ) : null}
              </div>
            ) : (
              <Text size="xs" c="dimmed">还没有选中优化指标。</Text>
            )}
          </div>
        )}
      </div>

      <div className="prompt-optimization-control-grid">
        <NumberInput
          label="最大优化轮次"
          min={1}
          max={5}
          value={maxIterations}
          onChange={(value) => onMaxIterationsChange?.(Number(value || 1))}
        />
        <NumberInput
          label="目标相似度阈值"
          min={0}
          max={100}
          value={targetScoreThreshold}
          onChange={(value) => onTargetScoreThresholdChange?.(Number(value || 0))}
        />
      </div>

      <div className="prompt-optimization-summary">
        <Badge variant="light" color="blue" radius="xl">
          已选指标 {selectedIndicatorCount}
        </Badge>
        <Badge variant="light" color="cyan" radius="xl">
          目标行数 {selectedRowCount}
        </Badge>
        <Badge variant="light" color="grape" radius="xl">
          PDF 数 {pdfFiles.length}
        </Badge>
        <Badge variant="light" color="gray" radius="xl">
          最多 {maxIterations} 轮
        </Badge>
        <Badge variant="light" color="teal" radius="xl">
          阈值 {targetScoreThreshold}
        </Badge>
      </div>

      {progressState ? (
        <div className="prompt-optimization-banner">
          <Text size="xs" fw={600} c={progressState.status === 'error' ? 'red.6' : 'blue.7'} mb={4}>
            当前进度
          </Text>
          <div className="prompt-optimization-badge-row">
            <Badge size="xs" color="blue" variant="light">
              指标 {progressState.batchIndex || 0}/{progressState.batchTotal || selectedIndicatorCount || 1}
            </Badge>
            <Badge size="xs" color="indigo" variant="light">
              阶段 {formatPhaseLabel(progressState.phase)}
            </Badge>
            <Badge size="xs" color="grape" variant="light">
              轮次 {progressState.round || 0}/{progressState.totalRounds || maxIterations}
            </Badge>
            <Badge size="xs" color={progressState.status === 'error' ? 'red' : progressState.status === 'completed' ? 'teal' : 'blue'} variant="light">
              {formatStatusLabel(progressState.status)}
            </Badge>
          </div>
          <Progress
            mt={8}
            radius="xl"
            size="sm"
            value={Number(progressState.percent || 0)}
            color={progressState.status === 'error' ? 'red' : 'blue'}
          />
          <Text size="xs" c="dimmed" mt={6}>
            {progressState.message || '正在执行自动优化流水线。'}
          </Text>
        </div>
      ) : null}

      <div className="prompt-optimization-actions">
        <Button
          size="md"
          radius="xl"
          disabled={!canOptimize}
          onClick={onStartOptimization}
          leftSection={<IconSparkles size={15} />}
        >
          {isOptimizing ? '优化中...' : '开始优化'}
        </Button>
      </div>

      {error ? (
        <div className="testbench-error-block prompt-optimization-error">
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
