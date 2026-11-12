import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Tabs } from '@mantine/core';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from '../constants/modelPresets.js';
import { PLATFORM_PAGE_KEYS } from '../constants/platformPages.js';
import { usePlatformConfig } from './PlatformConfigProvider.jsx';
import { authorizeCompanyRun, needsCompanyRunAuthorization } from '../services/runAuthorizationService.js';
import { useRunningTaskGuard } from '../utils/runningTaskGuard.js';
import {
  applyOptimizationCandidate,
  createDatasetFromComparisonRows,
  startPromptOptimizationRun
} from '../services/promptOptimizationService.js';
import {
  clearPromptOptimizationRunHistory,
  getPromptOptimizationRun,
  getPromptOptimizationStrategyEntry,
  getPromptOptimizationWorkspaceEntry,
  listPromptOptimizationRunSummaries,
  restorePromptOptimizationWorkspaceFiles,
  savePromptOptimizationStrategyEntry,
  savePromptOptimizationWorkspaceEntry,
  savePromptOptimizationWorkspaceFiles
} from '../services/promptOptimizationRepository.js';
import {
  checkPdfMatching,
  filterRowsByPdfAvailability,
  parseComparisonFile
} from '../services/testBenchService.js';
import {
  clearPageModelSelection,
  loadPageModelSelection,
  savePageModelSelection
} from '../utils/modelPresetStorage.js';
import {
  createPromptAsset,
  createPromptVersion,
  summarizeOptimizationRun
} from '../utils/promptOptimizationModel.js';
import {
  buildPromptOptimizationBatchTargets,
  buildPromptOptimizationIndicatorCatalog,
  buildPromptOptimizationSelectionSummary,
  buildIncomingOptimizationWorkspaceState,
} from '../utils/promptOptimizationViewModel.js';
import {
  getPresetCapabilityError,
  resolvePagePreset,
  resolveRuntimeLlmConfig
} from '../services/modelPresetResolver.js';
import { PagePresetQuickSwitch } from './modelPresets/PagePresetQuickSwitch.jsx';
import { OptimizationHistoryPanel } from './promptOptimization/OptimizationHistoryPanel.jsx';
import { OptimizationTargetPickerModal } from './promptOptimization/OptimizationTargetPickerModal.jsx';
import { OptimizationReviewPanel } from './promptOptimization/OptimizationReviewPanel.jsx';
import { OptimizationSetupPanel } from './promptOptimization/OptimizationSetupPanel.jsx';
import { OptimizationStrategyDrawer } from './promptOptimization/OptimizationStrategyDrawer.jsx';
import {
  buildPromptIterationSeed,
  findPromptAssetEntryByIndicatorCode,
  resolvePromptAssetBaseline
} from '../services/promptAssetLibraryService.js';
import {
  DEFAULT_PROMPT_OPTIMIZATION_STRATEGY,
  normalizePromptOptimizationStrategy
} from '../services/promptOptimizationStrategyService.js';
import {
  exportPromptOptimizationRunWorkbook
} from '../services/promptOptimizationExportService.js';
import {
  generateOptimizationCandidate,
  reviewOptimizationValidation,
  runOptimizationDiagnosis,
  validateOptimizationCandidate
} from '../services/promptOptimizationRuntimeService.js';

function withRunSummary(run) {
  const summary = summarizeOptimizationRun(run);
  return {
    ...run,
    bestCandidateId: run?.bestCandidateId || summary.bestCandidateId,
    bestScore: run?.bestScore ?? summary.bestScore
  };
}

function normalizeIndicatorCode(value) {
  return String(value || '').trim();
}

function getWorkspaceFileId(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function normalizePersistedNumber(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function QuickOptimizationMode({
  llm2Settings,
  modelPresets = [],
  globalDefaultPresetId = '',
  onOpenModelPresetManager,
  promptAssetEntries = [],
  onOpenPromptAssetLibrary,
  onPromptAssetsChanged,
  incomingContext = null,
  onConsumeIncomingContext,
  onSendToPromptIteration
}) {
  const { isPageEnabled, getPageDefaults } = usePlatformConfig();
  const pageEnabled = isPageEnabled(PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION);
  const pageDefaults = getPageDefaults(PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION);
  const pageDefaultsRef = useRef(pageDefaults);
  pageDefaultsRef.current = pageDefaults;
  const [selectedPresetId, setSelectedPresetId] = useState(() => loadPageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION));
  const [comparisonFile, setComparisonFile] = useState(null);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [comparisonRows, setComparisonRows] = useState([]);
  const [selectedTargetCodes, setSelectedTargetCodes] = useState([]);
  const [maxIterations, setMaxIterations] = useState(() => Number(pageDefaults.maxOptIterations) || 2);
  const [targetScoreThreshold, setTargetScoreThreshold] = useState(() => Number(pageDefaults.targetScoreThreshold) || 90);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState(null);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [activeTab, setActiveTab] = useState('setup');
  const [strategyOpened, setStrategyOpened] = useState(false);
  const [targetPickerOpened, setTargetPickerOpened] = useState(false);
  const [strategy, setStrategy] = useState(() => ({ ...DEFAULT_PROMPT_OPTIMIZATION_STRATEGY }));
  const [hasHydrated, setHasHydrated] = useState(false);
  const abortControllerRef = useRef(null);
  useRunningTaskGuard(PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION, isOptimizing);

  useEffect(() => () => {
    abortControllerRef.current?.abort();
  }, []);

  const selectedPreset = useMemo(
    () => resolvePagePreset(
      MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION,
      modelPresets,
      { [MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]: selectedPresetId },
      globalDefaultPresetId
    ),
    [globalDefaultPresetId, modelPresets, selectedPresetId]
  );
  const runtimeConfig = useMemo(() => {
    const config = resolveRuntimeLlmConfig(selectedPreset);
    return config ? {
      ...config,
      pageKey: PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION,
      maxRetries: Number(pageDefaults.maxRetries) || 3
    } : null;
  }, [pageDefaults.maxRetries, selectedPreset]);
  const capabilityError = useMemo(
    () => getPresetCapabilityError(
      selectedPreset,
      PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]
    ),
    [selectedPreset]
  );

  const indicatorCatalog = useMemo(
    () => buildPromptOptimizationIndicatorCatalog(comparisonRows),
    [comparisonRows]
  );
  const selectedTargets = useMemo(
    () => buildPromptOptimizationBatchTargets(comparisonRows, selectedTargetCodes),
    [comparisonRows, selectedTargetCodes]
  );
  const selectedTargetRows = useMemo(
    () => selectedTargets.flatMap((target) => target.rows),
    [selectedTargets]
  );
  const baselineStatesByCode = useMemo(
    () => {
      const map = new Map();
      selectedTargets.forEach((target) => {
        map.set(target.code, {
          promptAssetEntry: findPromptAssetEntryByIndicatorCode(promptAssetEntries, target.code),
          baselineState: resolvePromptAssetBaseline({
            indicatorCode: target.code,
            promptAssetEntries,
            comparisonRows: target.rows
          })
        });
      });
      return map;
    },
    [promptAssetEntries, selectedTargets]
  );
  const baselineSummary = useMemo(
    () => {
      const summary = {
        selectedCount: selectedTargets.length,
        libraryCount: 0,
        comparisonCount: 0,
        missingCount: 0,
        missingTargets: [],
        previewPrompt: '',
        hasNonLibraryTarget: false
      };

      selectedTargets.forEach((target) => {
        const state = baselineStatesByCode.get(target.code)?.baselineState;
        if (state?.source === 'library') {
          summary.libraryCount += 1;
        } else if (state?.source === 'comparison_file') {
          summary.comparisonCount += 1;
          summary.hasNonLibraryTarget = true;
        } else {
          summary.missingCount += 1;
          summary.hasNonLibraryTarget = true;
          summary.missingTargets.push({
            code: target.code,
            name: target.name
          });
        }

        if (!summary.previewPrompt && state?.userPromptTemplate && selectedTargets.length === 1) {
          summary.previewPrompt = state.userPromptTemplate;
        }
      });

      return summary;
    },
    [baselineStatesByCode, selectedTargets]
  );
  const selectionSummary = useMemo(
    () => buildPromptOptimizationSelectionSummary(indicatorCatalog, selectedTargetCodes),
    [indicatorCatalog, selectedTargetCodes]
  );

  const requiredReports = useMemo(
    () => Array.from(new Set(selectedTargetRows.map((row) => String(row.report_name || '').trim()).filter(Boolean))),
    [selectedTargetRows]
  );

  const canOptimize = Boolean(
    selectedTargets.length > 0 &&
    pdfFiles.length > 0 &&
    baselineSummary.missingCount === 0 &&
    runtimeConfig?.credentialsReady &&
    !capabilityError &&
    pageEnabled &&
    !isOptimizing
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [historyRuns, savedStrategy, workspace] = await Promise.all([
          listPromptOptimizationRunSummaries(),
          getPromptOptimizationStrategyEntry(),
          getPromptOptimizationWorkspaceEntry()
        ]);

        if (cancelled) {
          return;
        }

        const normalizedRuns = historyRuns.map(withRunSummary);
        setRuns(normalizedRuns);
        setStrategy(normalizePromptOptimizationStrategy(savedStrategy));

        if (workspace) {
          const restoredWorkspace = await restorePromptOptimizationWorkspaceFiles(workspace);
          if (cancelled) {
            return;
          }

          setComparisonRows(Array.isArray(restoredWorkspace.comparisonRows) ? restoredWorkspace.comparisonRows : []);
          const restoredCodes = Array.isArray(restoredWorkspace.selectedTargetCodes)
            ? restoredWorkspace.selectedTargetCodes.map((value) => normalizeIndicatorCode(value)).filter(Boolean)
            : normalizeIndicatorCode(restoredWorkspace.selectedTargetCode)
              ? [normalizeIndicatorCode(restoredWorkspace.selectedTargetCode)]
              : [];
          setSelectedTargetCodes(restoredCodes);
          setMaxIterations(normalizePersistedNumber(
            restoredWorkspace.maxIterations,
            Number(pageDefaultsRef.current.maxOptIterations) || 2
          ));
          setTargetScoreThreshold(normalizePersistedNumber(
            restoredWorkspace.targetScoreThreshold,
            Number(pageDefaultsRef.current.targetScoreThreshold) || 90
          ));
          setActiveTab(String(restoredWorkspace.activeTab || 'setup'));
          setComparisonFile(restoredWorkspace.comparisonFile?.file || null);
          setPdfFiles((restoredWorkspace.pdfFiles || []).map((item) => item.file).filter(Boolean));

          if (restoredWorkspace.currentRunId) {
            const savedRun = await getPromptOptimizationRun(restoredWorkspace.currentRunId);
            setCurrentRun(savedRun || null);
          }
        }
      } catch (_) {
        if (!cancelled) {
          setStrategy(normalizePromptOptimizationStrategy(null));
        }
      } finally {
        if (!cancelled) {
          setHasHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    savePromptOptimizationWorkspaceEntry({
      comparisonRows,
      selectedTargetCodes,
      selectedTargetCode: selectedTargetCodes[0] || '',
      maxIterations,
      targetScoreThreshold,
      activeTab,
      currentRunId: currentRun?.id || '',
      comparisonFile: comparisonFile ? {
        id: getWorkspaceFileId(comparisonFile),
        name: comparisonFile.name,
        type: comparisonFile.type
      } : null,
      pdfFiles: pdfFiles.map((file) => ({
        id: getWorkspaceFileId(file),
        name: file.name,
        type: file.type
      }))
    }).catch(() => {});
  }, [activeTab, comparisonFile, comparisonRows, currentRun?.id, hasHydrated, maxIterations, pdfFiles, selectedTargetCodes, targetScoreThreshold]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    savePromptOptimizationWorkspaceFiles({
      comparisonFile: comparisonFile ? {
        id: getWorkspaceFileId(comparisonFile),
        file: comparisonFile
      } : null,
      pdfFiles: pdfFiles.map((file) => ({
        id: getWorkspaceFileId(file),
        file
      }))
    }).catch(() => {});
  }, [comparisonFile, pdfFiles, hasHydrated]);

  useEffect(() => {
    if (!indicatorCatalog.length) {
      setSelectedTargetCodes([]);
      return;
    }

    const availableCodes = new Set(indicatorCatalog.map((item) => item.code));
    setSelectedTargetCodes((previous) => {
      const next = previous.filter((code) => availableCodes.has(code));
      return next.length > 0 ? next : [indicatorCatalog[0].code];
    });
  }, [indicatorCatalog]);

  useEffect(() => {
    if (!hasHydrated || !incomingContext?.id) {
      return;
    }

    const nextState = buildIncomingOptimizationWorkspaceState({
      comparisonRows: incomingContext.comparisonRows,
      comparisonFile: incomingContext.comparisonFile,
      selectedCodes: incomingContext.selectedCodes || incomingContext.preselectedCodes
    });

    setComparisonRows(nextState.comparisonRows);
    setComparisonFile(nextState.comparisonFile || null);
    setSelectedTargetCodes(nextState.selectedTargetCodes || []);
    setCurrentRun(null);
    setError('');
    setActiveTab(nextState.activeTab);
    onConsumeIncomingContext?.();
  }, [hasHydrated, incomingContext, onConsumeIncomingContext]);

  const handleComparisonFileSelect = async (file) => {
    setComparisonFile(file);
    setError('');
    try {
      const rows = await parseComparisonFile(file);
      setComparisonRows(rows);
    } catch (err) {
      setComparisonRows([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleComparisonFileRemove = () => {
    setComparisonFile(null);
    setComparisonRows([]);
    setSelectedTargetCodes([]);
    setError('');
  };

  const handlePdfSelect = (files) => {
    setPdfFiles(Array.isArray(files) ? files : [files]);
  };

  const handlePdfRemove = (file) => {
    setPdfFiles((previous) => previous.filter((item) => item !== file));
  };

  const handleStartOptimization = async () => {
    if (!pageEnabled) {
      window.alert('Prompt 自动优化当前已在后台关闭，不能启动新任务。');
      return;
    }
    if (!canOptimize) {
      return;
    }

    let runId = '';
    if (needsCompanyRunAuthorization(runtimeConfig)) {
      try {
        runId = await authorizeCompanyRun(PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION);
      } catch (error) {
        setError(error instanceof Error ? error.message : '运行授权失败，请稍后重试。');
        return;
      }
    }

    const failedTargets = [];
    const completedRuns = [];
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsOptimizing(true);
    setOptimizationProgress({
      status: 'running',
      phase: 'initializing',
      round: 0,
      totalRounds: maxIterations,
      percent: 0,
      batchIndex: 0,
      batchTotal: selectedTargets.length,
      message: '开始准备自动优化运行'
    });
    setError('');

    try {
      const llmSettings = {
        ...llm2Settings,
        apiUrl: runtimeConfig.apiUrl,
        apiKey: runtimeConfig.apiKey,
        modelName: runtimeConfig.modelName,
        providerType: runtimeConfig.providerType,
        serverManaged: runtimeConfig.serverManaged,
        companyConnectionId: runtimeConfig.companyConnectionId,
        supportsPdfUpload: runtimeConfig.supportsPdfUpload,
        pageKey: runtimeConfig.pageKey,
        runId,
        maxRetries: runtimeConfig.maxRetries,
        capabilities: runtimeConfig.capabilities,
        maxOptIterations: maxIterations,
        targetScoreThreshold
      };

      for (const [index, target] of selectedTargets.entries()) {
        if (controller.signal.aborted) {
          break;
        }
        try {
          const targetBaseline = baselineStatesByCode.get(target.code)?.baselineState;
          const targetPromptAssetEntry = baselineStatesByCode.get(target.code)?.promptAssetEntry;
          const baselinePrompt = String(targetBaseline?.userPromptTemplate || '').trim();

          if (!baselinePrompt) {
            throw new Error('缺少基线 Prompt');
          }

          const targetReports = Array.from(new Set(target.rows.map((row) => String(row.report_name || '').trim()).filter(Boolean)));
          const matchResult = checkPdfMatching(targetReports, pdfFiles);
          const { optimizableRows } = filterRowsByPdfAvailability(target.rows, matchResult.matched);

          if (!optimizableRows.length) {
            throw new Error('没有可优化的有效样本');
          }

          const initialAsset = targetPromptAssetEntry?.asset
            ? createPromptAsset({
                ...targetPromptAssetEntry.asset,
                latestVersionId: targetPromptAssetEntry.asset.latestVersionId,
                indicatorCode: targetPromptAssetEntry.asset.indicatorCode || target.code,
                indicatorName: targetPromptAssetEntry.asset.indicatorName || target.name,
                updatedAt: Date.now()
              })
            : createPromptAsset({
                name: target.name || target.code,
                targetName: target.name,
                indicatorCode: target.code,
                indicatorName: target.name
              });
          const baselineVersion = targetBaseline?.source === 'library' && targetBaseline.version
            ? createPromptVersion({
                ...targetBaseline.version,
                assetId: initialAsset.id
              })
            : createPromptVersion({
                assetId: initialAsset.id,
                label: targetBaseline?.source === 'comparison_file' ? '对比文件基线' : '基线版本',
                systemPrompt: targetBaseline?.systemPrompt,
                userPromptTemplate: baselinePrompt,
                sourceType: targetBaseline?.source === 'comparison_file' ? 'comparison_file' : 'manual'
              });
          const asset = createPromptAsset({
            ...initialAsset,
            latestVersionId: baselineVersion.id
          });
          const dataset = createDatasetFromComparisonRows({
            name: `${target.name} 数据集`,
            targetName: target.name,
            comparisonRows: optimizableRows,
            pdfFileIds: pdfFiles.map((file) => file.name)
          });
          const tokenStats = {
            optInput: 0,
            optOutput: 0,
            extractInput: 0,
            extractOutput: 0
          };
          const contextCache = new Map();

          const result = await startPromptOptimizationRun({
            asset,
            baselineVersion,
            dataset,
            pdfFiles,
            llmSettings,
            strategy,
            tokenStats,
            signal: controller.signal
          }, {
            engineDeps: {
              runDiagnosis: (engineInput) => runOptimizationDiagnosis({
                ...engineInput,
                llmSettings,
                strategy,
                tokenStats,
                maxRetries: llmSettings.maxRetries || 3,
                contextCache
              }),
              generateCandidate: (engineInput) => generateOptimizationCandidate({
                ...engineInput,
                llmSettings,
                strategy,
                tokenStats,
                maxRetries: llmSettings.maxRetries || 3
              }),
              validateCandidate: (engineInput) => validateOptimizationCandidate({
                ...engineInput,
                llmSettings,
                strategy,
                tokenStats,
                maxRetries: llmSettings.maxRetries || 3
              }),
              reviewValidation: (engineInput) => reviewOptimizationValidation({
                ...engineInput,
                llmSettings,
                strategy,
                tokenStats,
                maxRetries: llmSettings.maxRetries || 3
              }),
              onProgress: (event) => {
                setOptimizationProgress({
                  ...event,
                  batchIndex: index + 1,
                  batchTotal: selectedTargets.length,
                  indicatorCode: target.code,
                  indicatorName: target.name,
                  message: `第 ${index + 1}/${selectedTargets.length} 个指标 · ${target.code} ${target.name} · ${event.message || ''}`.trim()
                });
              }
            }
          });

          const nextRun = withRunSummary({
            ...result.run,
            tokenStats
          });
          completedRuns.push(nextRun);
        } catch (targetError) {
          if (controller.signal.aborted) {
            break;
          }
          failedTargets.push({
            code: target.code,
            name: target.name,
            message: targetError instanceof Error ? targetError.message : String(targetError)
          });
        }
      }

      if (completedRuns.length > 0) {
        const orderedNewRuns = [...completedRuns].reverse();
        const latestRun = completedRuns[completedRuns.length - 1];
        setCurrentRun(latestRun);
        setRuns((previous) => [
          ...orderedNewRuns,
          ...previous.filter((item) => !orderedNewRuns.some((newRun) => newRun.id === item.id))
        ]);
        setActiveTab(completedRuns.length > 1 ? 'history' : 'review');
        await onPromptAssetsChanged?.();
      }

      setOptimizationProgress({
        status: failedTargets.length > 0 && completedRuns.length === 0 ? 'error' : 'completed',
        phase: failedTargets.length > 0 && completedRuns.length === 0 ? 'failed' : 'completed',
        round: maxIterations,
        totalRounds: maxIterations,
        percent: 100,
        batchIndex: selectedTargets.length,
        batchTotal: selectedTargets.length,
        message: `完成 ${selectedTargets.length} 个指标处理，成功 ${completedRuns.length} 个，失败 ${failedTargets.length} 个`
      });

      if (failedTargets.length > 0) {
        setError(
          `以下指标未完成自动优化：${failedTargets.map((item) => `${item.code}(${item.message})`).join('，')}`
        );
      }
    } catch (err) {
      setOptimizationProgress({
        status: 'error',
        phase: 'failed',
        round: 0,
        totalRounds: maxIterations,
        percent: 0,
        message: err instanceof Error ? err.message : String(err)
      });
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSelectRun = async (run) => {
    const detail = run?.rounds ? run : await getPromptOptimizationRun(run?.id);
    if (!detail) {
      setError('未找到该次优化运行的完整记录。');
      return;
    }
    setCurrentRun(withRunSummary(detail));
    setActiveTab('review');
  };

  const handleClearHistory = async () => {
    await clearPromptOptimizationRunHistory();
    setRuns([]);
    setCurrentRun(null);
    setActiveTab('setup');
  };

  const handleApplyCandidate = async (candidateId) => {
    if (!currentRun) {
      return;
    }

    try {
      const currentRunAssetEntry = promptAssetEntries.find((entry) => entry.asset.id === currentRun.assetId) || null;
      const nextRun = withRunSummary(await applyOptimizationCandidate({
        asset: currentRunAssetEntry?.asset || { id: currentRun.assetId },
        run: currentRun,
        candidateId
      }));
      setCurrentRun(nextRun);
      setRuns((previous) => previous.map((item) => (item.id === nextRun.id ? nextRun : item)));
      await onPromptAssetsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActiveTab('setup');
    }
  };

  const handleExportCurrent = () => {
    if (!currentRun?.resultRows?.length) {
      return;
    }
    exportPromptOptimizationRunWorkbook(currentRun);
  };

  return (
    <section className="quick-optimization-mode">
      <div className="testbench-subpage-toolbar">
        <PagePresetQuickSwitch
          presets={modelPresets}
          preset={selectedPreset}
          value={selectedPreset?.id || selectedPresetId}
          requiredCapabilities={PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]}
          usesGlobalDefault={!selectedPresetId}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            savePageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION, presetId);
          }}
          onResetToGlobalDefault={() => {
            setSelectedPresetId('');
            clearPageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION);
          }}
          onOpenModelPresetManager={onOpenModelPresetManager}
          disabled={isOptimizing}
        />
        <Button variant="default" radius="sm" onClick={() => setStrategyOpened(true)}>
          优化策略
        </Button>
      </div>

      {!pageEnabled ? (
        <div className="platform-config-banner warning">
          本页已在后台关闭，不能启动新任务；已经运行的任务可以继续完成。
        </div>
      ) : null}

      {!runtimeConfig?.credentialsReady ? (
        <div className="platform-config-banner warning">
          当前模型凭据未就绪。个人预设需要补全 API Key，公司预设需要管理员配置可用连接。
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || 'setup')}
        className="prompt-optimization-tabs"
      >
        <Tabs.List>
          <Tabs.Tab value="setup">优化配置</Tabs.Tab>
          <Tabs.Tab value="history">历史运行</Tabs.Tab>
          <Tabs.Tab value="review" disabled={!currentRun}>结果审核</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="setup" pt="md">
          <OptimizationSetupPanel
            comparisonFile={comparisonFile}
            pdfFiles={pdfFiles}
            onComparisonFileSelect={handleComparisonFileSelect}
            onComparisonFileRemove={handleComparisonFileRemove}
            onPdfSelect={handlePdfSelect}
            onPdfRemove={handlePdfRemove}
            requiredReports={requiredReports}
            indicatorCatalog={indicatorCatalog}
            selectionSummary={selectionSummary}
            onOpenTargetPicker={() => setTargetPickerOpened(true)}
            maxIterations={maxIterations}
            onMaxIterationsChange={setMaxIterations}
            targetScoreThreshold={targetScoreThreshold}
            onTargetScoreThresholdChange={setTargetScoreThreshold}
            selectedIndicatorCount={selectedTargets.length}
            selectedRowCount={selectedTargetRows.length}
            totalRowCount={comparisonRows.length}
            baselineSummary={baselineSummary}
            onOpenPromptAssetLibrary={onOpenPromptAssetLibrary}
            strategy={strategy}
            canOptimize={canOptimize}
            isOptimizing={isOptimizing}
            progressState={optimizationProgress}
            onStartOptimization={handleStartOptimization}
            error={error}
          />
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <OptimizationHistoryPanel
            runs={runs}
            onClearHistory={handleClearHistory}
            onSelectRun={handleSelectRun}
          />
        </Tabs.Panel>

        <Tabs.Panel value="review" pt="md">
          <OptimizationReviewPanel
            run={currentRun}
            onApply={handleApplyCandidate}
            onExport={handleExportCurrent}
            onSendToPromptIteration={(candidateId) => {
              const candidate = (currentRun?.candidates || []).find((item) => item.id === candidateId)
                || currentRun?.candidates?.[0]
                || null;
              const assetEntry = promptAssetEntries.find((entry) => entry.asset.id === currentRun?.assetId) || null;
              const latestVersion = assetEntry?.versions?.find((item) => item.id === currentRun?.appliedVersionId)
                || assetEntry?.latestVersion
                || null;

              onSendToPromptIteration?.(buildPromptIterationSeed({
                assetId: currentRun?.assetId,
                versionId: currentRun?.appliedVersionId || latestVersion?.id || '',
                indicatorCode: currentRun?.indicatorCode,
                indicatorName: currentRun?.targetName || currentRun?.indicatorName,
                systemPrompt: latestVersion?.systemPrompt || '',
                userPrompt: candidate?.promptText || currentRun?.baselinePromptText || ''
              }));
            }}
          />
        </Tabs.Panel>
      </Tabs>

      <OptimizationStrategyDrawer
        opened={strategyOpened}
        onClose={() => setStrategyOpened(false)}
        strategy={strategy}
        onStrategyChange={setStrategy}
        onReset={() => setStrategy(normalizePromptOptimizationStrategy(DEFAULT_PROMPT_OPTIMIZATION_STRATEGY))}
        onSave={async () => {
          const normalized = normalizePromptOptimizationStrategy(strategy);
          setStrategy(normalized);
          await savePromptOptimizationStrategyEntry(normalized);
          setStrategyOpened(false);
        }}
      />

      <OptimizationTargetPickerModal
        opened={targetPickerOpened}
        onClose={() => setTargetPickerOpened(false)}
        comparisonRows={comparisonRows}
        defaultMinSimilarity={0}
        defaultMaxSimilarity={100}
        initialSelectedCodes={selectedTargetCodes}
        title="调整要自动优化的指标"
        confirmLabel="确认指标"
        onConfirm={(codes) => {
          setSelectedTargetCodes(codes);
          setTargetPickerOpened(false);
        }}
      />
    </section>
  );
}
