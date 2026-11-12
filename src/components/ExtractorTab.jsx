import { useState } from 'react';
import { Badge, Button, Checkbox, Group, Modal, Select, Text } from '@mantine/core';
import {
  IconLayoutDashboard,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconPlayerPlayFilled
} from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';
import { ResultsPanel } from './ResultsPanel.jsx';
import {
  BATCH_SIZE_OPTIONS,
  MAX_CONCURRENCY_OPTIONS,
  PROCESSABLE_VALUE_TYPES
} from '../constants/extraction.js';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from '../constants/modelPresets.js';
import { PLATFORM_PAGE_KEYS } from '../constants/platformPages.js';
import { ClosedPageOverlay } from './ClosedPageOverlay.jsx';
import { PagePresetQuickSwitch } from './modelPresets/PagePresetQuickSwitch.jsx';
import { PromptAssetRequirementPicker } from './promptAssets/PromptAssetRequirementPicker.jsx';

function formatPdfInfo(file) {
  if (Array.isArray(file)) {
    const totalSizeMb = file.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024;
    return `已选择 ${file.length} 个 PDF（${totalSizeMb.toFixed(2)} MB）`;
  }
  return `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
}

function formatRequirementInfo(file) {
  return file.name;
}

function IndicatorTypeCheckbox({ type, checked, onChange }) {
  return (
    <Checkbox
      className="checkbox-chip checkbox-chip-mantine"
      label={type}
      checked={checked}
      onChange={() => onChange(type)}
      radius="xl"
      iconColor="#ffffff"
      styles={{
        root: { margin: 0 },
        body: { alignItems: 'center' },
        label: { color: 'var(--text-primary)', fontSize: '0.92rem', paddingLeft: 10 },
        input: {
          backgroundColor: 'rgba(7,16,30,0.82)',
          borderColor: 'rgba(255,255,255,0.18)'
        }
      }}
    />
  );
}

function toSelectData(values) {
  return values.map((value) => ({ value: String(value), label: String(value) }));
}

export function ExtractorTab({
  title = '工作台',
  description = '',
  canStart,
  hasCredentials,
  pageEnabled = true,
  isRunning,
  isStopping = false,
  onStop,
  pdfFiles,
  requirementsFile,
  promptAssetRequirements = [],
  onSelectPromptAssetRequirements,
  onClearPromptAssetRequirements,
  onSelectPdf,
  onRemovePdf,
  onSelectRequirements,
  onStart,
  progress,
  results,
  displayedResults,
  filterOnlyFound,
  onToggleFilter,
  onExport,
  stats,
  settings,
  onChangeSetting,
  onIndicatorTypeToggle,
  modelPresets = [],
  selectedPresetId = '',
  usesGlobalDefault = false,
  onSelectPreset,
  onResetPreset,
  presetCapabilityError = '',
  onOpenModelPresetManager,
  onRefreshConfig
}) {
  const [assetRequirementPickerOpen, setAssetRequirementPickerOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const indicatorTypes = Array.isArray(settings?.indicatorTypes) ? settings.indicatorTypes : [];
  const batchSize = Number(settings?.batchSize || BATCH_SIZE_OPTIONS[0]);
  const maxConcurrency = Number(settings?.maxConcurrency || MAX_CONCURRENCY_OPTIONS[0]);
  const readinessItems = [
    { label: 'PDF 报告', ready: pdfFiles.length > 0 },
    { label: '需求清单', ready: Boolean(requirementsFile) || promptAssetRequirements.length > 0 },
    { label: '模型预设', ready: hasCredentials && !presetCapabilityError },
    { label: '页面开放', ready: pageEnabled },
    { label: '指标类型', ready: indicatorTypes.length > 0 }
  ];

  return (
    <>
      <div className="closed-page-content" inert={!pageEnabled ? true : undefined}>
      <section className="glass-panel main-panel">
        <div className="section-heading workspace-heading">
          <div className="workspace-heading-shell">
            <div className="workspace-heading-copy">
              <h2 className="section-title">
                <IconLayoutDashboard size={20} stroke={1.8} />
                <span>{title}</span>
              </h2>
              {description ? <p className="section-caption">{description}</p> : null}
            </div>
            <div className="workspace-heading-actions">
              <PagePresetQuickSwitch
                presets={modelPresets}
                preset={modelPresets.find((item) => item.id === selectedPresetId) || null}
                value={selectedPresetId}
                requiredCapabilities={PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.ONLINE_VALIDATION]}
                usesGlobalDefault={usesGlobalDefault}
                onChange={onSelectPreset}
                onResetToGlobalDefault={onResetPreset}
                onOpenModelPresetManager={onOpenModelPresetManager}
                disabled={isRunning}
              />
            </div>
          </div>
        </div>

        <section className="panel-block workbench-settings">
          <div className="panel-header">
            <div>
              <h3>提取参数</h3>
              <p>模型连接已收束为全局默认 + 页面覆盖，这里只保留运行参数。</p>
            </div>
          </div>
          <div className="settings-grid workbench-grid">
            <div className="input-group">
              <Select
                label="批次大小"
                value={String(batchSize)}
                onChange={(value) => value && onChangeSetting('batchSize', Number(value))}
                data={toSelectData(BATCH_SIZE_OPTIONS)}
                className="mantine-field"
                comboboxProps={{ withinPortal: false }}
              />
            </div>

            <div className="input-group">
              <Select
                label="最大并发数"
                value={String(maxConcurrency)}
                onChange={(value) => value && onChangeSetting('maxConcurrency', Number(value))}
                data={toSelectData(MAX_CONCURRENCY_OPTIONS)}
                className="mantine-field"
                comboboxProps={{ withinPortal: false }}
              />
            </div>

            <div className="input-group input-group-wide">
              <label>处理的指标类型</label>
              <div className="checkbox-group">
                {PROCESSABLE_VALUE_TYPES.map((type) => (
                  <IndicatorTypeCheckbox
                    key={type}
                    type={type}
                    checked={indicatorTypes.includes(type)}
                    onChange={onIndicatorTypeToggle}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-header">
            <div>
              <h3>文件上传</h3>
              <p>支持拖拽上传，文件选中后会在卡片中显示状态。</p>
            </div>
          </div>

          <div className="upload-section">
            <UploadCard
              icon={<IconFileTypePdf size={26} stroke={1.8} />}
              tag="PDF"
              title="上传 PDF"
              hint="上传一份或多份源报告，系统会按顺序处理"
              acceptHint="支持多篇 PDF，系统会按顺序逐篇提取"
              buttonLabel="选择 PDF"
              accept="application/pdf"
              file={pdfFiles}
              multiple
              onFileSelect={onSelectPdf}
              onRemoveFile={onRemovePdf}
              formatFileInfo={formatPdfInfo}
            />
            <UploadCard
              icon={<IconFileSpreadsheet size={26} stroke={1.8} />}
              tag="Excel / CSV"
              title="上传需求清单"
              hint="包含 value_type、indicator_code、indicator_name、definition、guidance、prompt 等字段"
              acceptHint="支持 .xlsx / .xls / .csv"
              buttonLabel="选择 Excel"
              accept=".xlsx,.xls,.csv"
              file={requirementsFile}
              onFileSelect={onSelectRequirements}
              formatFileInfo={formatRequirementInfo}
            />
          </div>

          <div className="requirement-asset-source">
            <div>
              <strong>或直接使用 Prompt 资产库作为需求清单</strong>
              <p>选择带 value_type 的资产后，使用资产里的 user_prompt / system_prompt 直接运行。</p>
            </div>
            <div className="requirement-asset-source-actions">
              {promptAssetRequirements.length > 0 ? (
                <Badge variant="light" color="teal" radius="xl">
                  已选 {promptAssetRequirements.length} 条资产需求
                </Badge>
              ) : null}
              <Button size="xs" radius="xl" variant="default" onClick={() => setAssetRequirementPickerOpen(true)}>
                {promptAssetRequirements.length > 0 ? '重新选择' : '从 Prompt 资产库选择'}
              </Button>
              {promptAssetRequirements.length > 0 ? (
                <Button size="xs" radius="xl" variant="subtle" color="red" onClick={onClearPromptAssetRequirements}>
                  清除
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <PromptAssetRequirementPicker
          opened={assetRequirementPickerOpen}
          onClose={() => setAssetRequirementPickerOpen(false)}
          selectedAssetIds={promptAssetRequirements.map((item) => item.source_asset_id).filter(Boolean)}
          onConfirm={(requirements) => onSelectPromptAssetRequirements?.(requirements)}
        />

        <section className="action-card">
          <div className="action-copy">
            <span className="eyebrow">运行检查</span>
            <h3>{canStart ? '可以开始提取了' : '还差几步就能开始运行'}</h3>
            <div className="readiness-list">
              {readinessItems.map((item) => (
                <Badge
                  key={item.label}
                  variant={item.ready ? 'light' : 'outline'}
                  color={item.ready ? 'teal' : 'gray'}
                  radius="xl"
                  size="lg"
                  className={`readiness-item ${item.ready ? 'ready' : ''}`}
                >
                  {item.ready ? '✓' : '•'} {item.label}
                </Badge>
              ))}
            </div>
          </div>

          <Group gap="xs">
            {isRunning ? (
              <Button
                size="md"
                radius="xl"
                variant="light"
                color="red"
                disabled={isStopping}
                onClick={() => setStopConfirmOpen(true)}
              >
                {isStopping ? '等待当前结果...' : '停止'}
              </Button>
            ) : null}
            <Button
              size="md"
              radius="xl"
              className="btn-primary btn-primary-mantine"
              disabled={!canStart || isRunning || !pageEnabled}
              onClick={onStart}
              leftSection={<IconPlayerPlayFilled size={16} />}
            >
              {isRunning ? '提取运行中...' : '开始提取'}
            </Button>
          </Group>
        </section>

        <Modal
          opened={stopConfirmOpen}
          onClose={() => setStopConfirmOpen(false)}
          title="停止本次线上验证？"
          centered
          size="md"
        >
          <Text size="sm">
            确认后会停止启动新的批次，但会等待当前已经发出的模型请求返回；已经完成的结果会保留。
          </Text>
          <Group justify="flex-end" mt="lg">
            <Button variant="default" onClick={() => setStopConfirmOpen(false)}>继续运行</Button>
            <Button
              color="red"
              onClick={() => {
                setStopConfirmOpen(false);
                onStop?.();
              }}
            >
              确认停止
            </Button>
          </Group>
        </Modal>

        <ProgressPanel progress={progress} />
      </section>

      <ResultsPanel
        results={results}
        displayedResults={displayedResults}
        filterOnlyFound={filterOnlyFound}
        onToggleFilter={onToggleFilter}
        onExport={onExport}
        stats={stats}
      />
      </div>
      {!pageEnabled ? (
        <ClosedPageOverlay
          pageLabel={title}
          onRefresh={onRefreshConfig}
        />
      ) : null}
    </>
  );
}
