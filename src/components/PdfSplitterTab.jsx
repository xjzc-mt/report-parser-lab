import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Badge, Button, TextInput, Textarea } from '@mantine/core';
import {
  IconDownload,
  IconFileSearch,
  IconPlayerPlayFilled,
  IconPlus,
  IconTrash
} from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';
import { locatePdfPages, PAGE_NOT_FOUND } from '../services/pdfSplitterService.js';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from '../constants/modelPresets.js';
import { PLATFORM_PAGE_KEYS } from '../constants/platformPages.js';
import { LS_CHUNKING_STATE } from '../constants/pageStorage.js';
import { usePlatformConfig } from './PlatformConfigProvider.jsx';
import { useRunningTaskGuard } from '../utils/runningTaskGuard.js';
import { authorizeCompanyRun, needsCompanyRunAuthorization } from '../services/runAuthorizationService.js';
import { resolvePagePreset, resolveRuntimeLlmConfig, getPresetCapabilityError } from '../services/modelPresetResolver.js';
import {
  clearPageModelSelection,
  loadPageModelSelection,
  savePageModelSelection
} from '../utils/modelPresetStorage.js';
import { PagePresetQuickSwitch } from './modelPresets/PagePresetQuickSwitch.jsx';

function createInitialProgress() {
  return {
    visible: false,
    status: '',
    percentage: 0,
    logs: [],
    isLoading: false
  };
}

function createItem(item = {}) {
  return {
    id: String(item.id || `${Date.now()}-${Math.random()}`),
    name: String(item.name || ''),
    description: String(item.description || '')
  };
}

function loadChunkingItems() {
  try {
    const raw = localStorage.getItem(LS_CHUNKING_STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
        return parsed.items.map(createItem);
      }
    }
  } catch (_) { /* ignore */ }
  return [createItem()];
}

function getFileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function formatPdfInfo(files) {
  if (Array.isArray(files)) {
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    return `${files.length} 个 PDF (${(totalSize / 1024 / 1024).toFixed(2)} MB)`;
  }

  return `${files.name} (${(files.size / 1024 / 1024).toFixed(2)} MB)`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFilledItems(items) {
  return items.filter((item) => item.name.trim() && item.description.trim());
}

function getIncompleteItems(items) {
  return items.filter((item) => {
    const hasName = item.name.trim().length > 0;
    const hasDescription = item.description.trim().length > 0;
    return (hasName || hasDescription) && !(hasName && hasDescription);
  });
}

export function PdfSplitterTab({
  globalSettings,
  settings,
  modelPresets = [],
  globalDefaultPresetId = '',
  onOpenModelPresetManager
}) {
  const effectiveSettings = globalSettings || settings || {};
  const { isPageEnabled, getPageDefaults } = usePlatformConfig();
  const pageEnabled = isPageEnabled(PLATFORM_PAGE_KEYS.CHUNKING);
  const pageDefaults = getPageDefaults(PLATFORM_PAGE_KEYS.CHUNKING);
  const [selectedPresetId, setSelectedPresetId] = useState(() => loadPageModelSelection(MODEL_PAGE_KEYS.CHUNKING_TEST));
  const [pdfFiles, setPdfFiles] = useState([]);
  const [items, setItems] = useState(loadChunkingItems);
  const [isRunning, setIsRunning] = useState(false);
  useRunningTaskGuard(PLATFORM_PAGE_KEYS.CHUNKING, isRunning);
  const [progress, setProgress] = useState(createInitialProgress);
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);
  const selectedPreset = useMemo(
    () => resolvePagePreset(
      MODEL_PAGE_KEYS.CHUNKING_TEST,
      modelPresets,
      { [MODEL_PAGE_KEYS.CHUNKING_TEST]: selectedPresetId },
      globalDefaultPresetId
    ),
    [globalDefaultPresetId, modelPresets, selectedPresetId]
  );
  const runtimeConfig = useMemo(() => {
    const config = resolveRuntimeLlmConfig(selectedPreset);
    return config ? {
      ...config,
      pageKey: PLATFORM_PAGE_KEYS.CHUNKING,
      maxRetries: Number(pageDefaults.maxRetries) || 3
    } : null;
  }, [pageDefaults.maxRetries, selectedPreset]);
  const capabilityError = useMemo(
    () => getPresetCapabilityError(
      selectedPreset,
      PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.CHUNKING_TEST]
    ),
    [selectedPreset]
  );

  useEffect(() => {
    try {
      localStorage.setItem(LS_CHUNKING_STATE, JSON.stringify({ items }));
    } catch (_) { /* ignore */ }
  }, [items]);

  const filledItems = useMemo(() => getFilledItems(items), [items]);
  const incompleteItems = useMemo(() => getIncompleteItems(items), [items]);
  const canStart = Boolean(
    pdfFiles.length > 0 &&
    filledItems.length > 0 &&
    runtimeConfig?.credentialsReady &&
    !capabilityError &&
    pageEnabled &&
    !isRunning &&
    incompleteItems.length === 0
  );

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => () => {
    if (resultRef.current?.downloadUrl) {
      URL.revokeObjectURL(resultRef.current.downloadUrl);
    }
  }, []);

  const appendProgress = ({ message, percentage, timestamp }) => {
    setProgress((previous) => ({
      visible: true,
      status: message || previous.status,
      percentage: percentage >= 0 ? percentage : previous.percentage,
      logs: [
        ...previous.logs,
        {
          id: `${Date.now()}-${Math.random()}`,
          time: timestamp,
          message
        }
      ],
      isLoading: percentage >= 0 ? percentage < 100 : previous.isLoading
    }));
  };

  const clearDownloadUrl = () => {
    if (resultRef.current?.downloadUrl) {
      URL.revokeObjectURL(resultRef.current.downloadUrl);
    }
  };

  const handlePdfSelect = (files) => {
    const nextFiles = Array.isArray(files) ? files : [files].filter(Boolean);
    if (nextFiles.length === 0) return;

    const invalidFile = nextFiles.find((file) => !(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')));
    if (invalidFile) {
      window.alert(`请只上传有效的 PDF 文件。无效文件：${invalidFile.name}`);
      return;
    }

    setPdfFiles((previous) => {
      const merged = [...previous];
      const seen = new Set(previous.map(getFileIdentity));

      nextFiles.forEach((file) => {
        const identity = getFileIdentity(file);
        if (!seen.has(identity)) {
          merged.push(file);
          seen.add(identity);
        }
      });

      return merged;
    });
  };

  const handleRemovePdf = (fileToRemove) => {
    const identity = getFileIdentity(fileToRemove);
    setPdfFiles((previous) => previous.filter((file) => getFileIdentity(file) !== identity));
  };

  const handleItemChange = (id, key, value) => {
    setItems((previous) => previous.map((item) => (
      item.id === id
        ? { ...item, [key]: value }
        : item
    )));
  };

  const handleAddItem = () => {
    setItems((previous) => [...previous, createItem()]);
  };

  const handleRemoveItem = (id) => {
    setItems((previous) => {
      if (previous.length === 1) {
        return [createItem()];
      }
      return previous.filter((item) => item.id !== id);
    });
  };

  const handleRun = async () => {
    if (pdfFiles.length === 0) {
      window.alert('请至少上传一份 PDF 文件。');
      return;
    }

    if (incompleteItems.length > 0) {
      window.alert('请确保每条输入都同时包含“名称”和“描述”，或者删掉未填写完整的行。');
      return;
    }

    if (filledItems.length === 0) {
      window.alert('请至少填写一条“名称 + 描述”。');
      return;
    }

    let runId = '';
    if (needsCompanyRunAuthorization(runtimeConfig)) {
      try {
        runId = await authorizeCompanyRun(PLATFORM_PAGE_KEYS.CHUNKING);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '运行授权失败，请稍后重试。');
        return;
      }
    }

    setIsRunning(true);
    clearDownloadUrl();
    setResult(null);
    setProgress({
      visible: true,
      status: '开始 PDF 分割任务...',
      percentage: 0,
      logs: [],
      isLoading: true
    });

    try {
      const response = await locatePdfPages({
        pdfFiles,
        items: filledItems,
        settings: {
          ...effectiveSettings,
          apiKey: runtimeConfig.apiKey,
          apiUrl: runtimeConfig.apiUrl,
          modelName: runtimeConfig.modelName,
          providerType: runtimeConfig.providerType,
          serverManaged: runtimeConfig.serverManaged,
          companyConnectionId: runtimeConfig.companyConnectionId,
          supportsPdfUpload: runtimeConfig.supportsPdfUpload,
          pageKey: runtimeConfig.pageKey,
          runId,
          maxRetries: runtimeConfig.maxRetries
        },
        onProgress: appendProgress
      });

      const downloadUrl = response.zipBlob ? URL.createObjectURL(response.zipBlob) : null;
      setResult({
        ...response,
        downloadUrl,
        zipSize: response.zipBlob?.size || 0
      });
    } catch (error) {
      console.error(error);
      appendProgress({
        message: `Error: ${error.message}`,
        percentage: 100,
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      setIsRunning(false);
      setProgress((previous) => ({
        ...previous,
        isLoading: false
      }));
    }
  };

  return (
    <section className="glass-panel main-panel compressor-simple">
      {!pageEnabled ? (
        <div className="platform-config-banner warning">
          本页已在后台关闭，不能启动新任务；已经运行的任务可以继续完成。
        </div>
      ) : null}
      <div className="dataprep-subpage-toolbar">
        <PagePresetQuickSwitch
          presets={modelPresets}
          preset={selectedPreset}
          value={selectedPreset?.id || selectedPresetId}
          requiredCapabilities={PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.CHUNKING_TEST]}
          usesGlobalDefault={!selectedPresetId}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            savePageModelSelection(MODEL_PAGE_KEYS.CHUNKING_TEST, presetId);
          }}
          onResetToGlobalDefault={() => {
            setSelectedPresetId('');
            clearPageModelSelection(MODEL_PAGE_KEYS.CHUNKING_TEST);
          }}
          onOpenModelPresetManager={onOpenModelPresetManager}
          disabled={isRunning}
        />
      </div>

      <div className="splitter-upload-grid">
        <UploadCard
          icon={<IconFileSearch size={26} stroke={1.8} />}
          tag="PDF"
          title="PDF 文件"
          hint="上传一个或多个 PDF"
          acceptHint="支持多文件上传"
          buttonLabel="选择 PDF 文件"
          accept="application/pdf"
          file={pdfFiles}
          multiple
          onFileSelect={handlePdfSelect}
          onRemoveFile={handleRemovePdf}
          formatFileInfo={formatPdfInfo}
        />
      </div>

      <div className="splitter-items-card">
        <div className="panel-header">
          <div>
            <h3>页码定位条目</h3>
            <p>每条都需要同时填写名称和描述。</p>
          </div>
          <Button size="sm" radius="xl" variant="light" onClick={handleAddItem} leftSection={<IconPlus size={16} />}>
            新增一条
          </Button>
        </div>

        <div className="splitter-items-list">
          {items.map((item, index) => (
            <article key={item.id} className="splitter-item-row">
              <div className="splitter-item-row-head">
                <Badge variant="light" color="blue" radius="xl">#{index + 1}</Badge>
                <ActionIcon
                  type="button"
                  variant="subtle"
                  color="red"
                  radius="xl"
                  onClick={() => handleRemoveItem(item.id)}
                  aria-label={`删除第 ${index + 1} 条描述`}
                >
                  <IconTrash size={16} stroke={1.8} />
                </ActionIcon>
              </div>

              <TextInput
                label="名称"
                placeholder="例如：董事长致辞"
                value={item.name}
                onChange={(event) => handleItemChange(item.id, 'name', event.currentTarget.value)}
                className="mantine-field"
              />

              <Textarea
                label="描述"
                placeholder="例如：董事长或董事会主席发表的致辞、寄语或开篇说明部分"
                minRows={3}
                autosize
                value={item.description}
                onChange={(event) => handleItemChange(item.id, 'description', event.currentTarget.value)}
                className="mantine-field"
              />
            </article>
          ))}
        </div>

        <div className="splitter-description-count">
          PDF {pdfFiles.length} 份 · 已完成 {filledItems.length} 条 · 待补全 {incompleteItems.length} 条
        </div>
      </div>

      <div className="compressor-simple-action splitter-simple-action">
        <Button
          size="lg"
          radius="xl"
          className="btn-primary btn-primary-mantine splitter-start-btn"
          disabled={!canStart}
          onClick={handleRun}
          leftSection={<IconPlayerPlayFilled size={16} />}
        >
          {isRunning ? '正在分割...' : '开始批量分割'}
        </Button>
      </div>

      <ProgressPanel progress={progress} eyebrow="PDF 切割" title="分割进度" maxLogs={5} />

      {result ? (
        <section className="panel-block splitter-result-panel">
          <div className="compressor-result-header">
            <Badge variant="light" color={result.downloadUrl ? 'teal' : 'gray'} radius="xl" size="lg">
              {result.downloadUrl ? 'ZIP 已生成' : '未生成可下载文件'}
            </Badge>
            <h3 className="compressor-result-title">已处理 {result.stats?.totalFiles || 0} 份 PDF</h3>
          </div>

          <div className="summary-strip splitter-summary-strip splitter-summary-strong">
            <div className="summary-chip">
              <strong>文件数</strong>
              <span>{result.stats?.totalFiles || 0}</span>
            </div>
            <div className="summary-chip">
              <strong>条目数</strong>
              <span>{result.stats?.totalItems || 0}</span>
            </div>
            <div className="summary-chip">
              <strong>检索数</strong>
              <span>{result.stats?.totalSearches || 0}</span>
            </div>
            <div className="summary-chip">
              <strong>命中数</strong>
              <span>{result.stats?.foundCount || 0}</span>
            </div>
            <div className="summary-chip">
              <strong>生成 PDF</strong>
              <span>{result.stats?.generatedFiles || 0}</span>
            </div>
            <div className="summary-chip">
              <strong>ZIP</strong>
              <span>{formatBytes(result.zipSize)}</span>
            </div>
            <div className="summary-chip">
              <strong>页数</strong>
              <span>{result.stats?.totalMatchedPages || 0}</span>
            </div>
            <div className="summary-chip">
              <strong>耗时</strong>
              <span>{result.stats?.duration || '-'}</span>
            </div>
          </div>

          {result.downloadUrl ? (
            <Button
              component="a"
              href={result.downloadUrl}
              download={result.zipFileName}
              size="xl"
              radius="xl"
              className="btn-primary btn-primary-mantine splitter-download-large"
              leftSection={<IconDownload size={18} />}
            >
              下载分割后的 ZIP
            </Button>
          ) : (
            <div className="splitter-empty-download">
              没有解析到可拆分的页码，请调整描述后重试。
            </div>
          )}

          <div className="splitter-file-results">
            {result.fileResults?.map((fileResult) => (
              <section key={fileResult.fileName} className="splitter-file-card">
                <div className="splitter-file-card-head">
                  <div>
                    <h4 className="splitter-file-title">{fileResult.fileName}</h4>
                    <p className="splitter-result-reason">
                      匹配 {fileResult.foundCount} 条 · 生成 {fileResult.generatedFiles} 个 PDF · 共 {fileResult.totalMatchedPages} 页
                    </p>
                  </div>
                  <Badge variant="light" color="blue" radius="xl">
                    {fileResult.totalPages} 页原始 PDF
                  </Badge>
                </div>

                <div className="splitter-results-list">
                  {fileResult.results.map((item) => (
                    <article key={`${fileResult.fileName}-${item.index}-${item.name}-${item.description}`} className="splitter-result-row">
                      <div className="splitter-result-main">
                        <div className="splitter-result-topline">
                          <span className="splitter-result-index">#{item.index}</span>
                          <h4 className="splitter-result-name">{item.name}</h4>
                          <Badge
                            variant={item.generated ? 'light' : 'outline'}
                            color={item.generated ? 'teal' : 'gray'}
                            radius="xl"
                          >
                            {item.generated ? '已生成 PDF' : '未找到'}
                          </Badge>
                        </div>
                        <p className="splitter-result-description">{item.description}</p>
                      </div>

                      <div className="splitter-result-side">
                        <div className="splitter-result-pages">
                          <span className="splitter-result-label">页码</span>
                          <Badge
                            variant={item.pdf_numbers === PAGE_NOT_FOUND ? 'outline' : 'light'}
                            color={item.pdf_numbers === PAGE_NOT_FOUND ? 'gray' : 'blue'}
                            radius="xl"
                            size="lg"
                          >
                            {item.pdf_numbers}
                          </Badge>
                        </div>
                        {item.reason ? (
                          <p className="splitter-result-reason">{item.reason}</p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
