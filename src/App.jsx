import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header.jsx';
import { LLMSettingsDrawer } from './components/LLMSettingsDrawer.jsx';
import { OnlineValidationWorkbench } from './components/OnlineValidationWorkbench.jsx';
import { DataPreprocessingWorkbench } from './components/DataPreprocessingWorkbench.jsx';
import { MethodologyTab } from './components/MethodologyTab.jsx';
import { ClosedPageOverlay } from './components/ClosedPageOverlay.jsx';
import { DEFAULT_SETTINGS } from './constants/extraction.js';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from './constants/modelPresets.js';
import { exportResultsToExcel } from './services/exportService.js';
import { runExtractionJob } from './services/extractionService.js';
import { isPricingConfigured } from './services/llmClient.js';
import { buildOnlineValidationRunSettings } from './utils/onlineValidationSettings.js';
import { mergeExtractionFileStats } from './utils/extractionStats.js';
import { authorizeCompanyRun, needsCompanyRunAuthorization } from './services/runAuthorizationService.js';
import { filterPersistablePresets, initializeModelPresetSystem, mergePresetCollections } from './services/modelPresetService.js';
import { getPresetCapabilityError, resolvePagePreset, resolveRuntimeLlmConfig } from './services/modelPresetResolver.js';
import { isCompanyPreset } from './services/platformConfigService.js';
import { PLATFORM_PAGE_KEYS } from './constants/platformPages.js';
import { usePlatformConfig } from './components/PlatformConfigProvider.jsx';
import {
  getPageKeyForDataPrepSubtab,
  getPageKeyForTestSetSubtab,
  getVisibleDataPrepSubtabs,
  getVisibleTopTabs
} from './utils/platformPageVisibility.js';
import { confirmNavigationIfRunning, hasRunningTasks, useRunningTaskGuard } from './utils/runningTaskGuard.js';
import {
  DEFAULT_DATA_PREP_SUBTAB_KEY,
  LS_ACTIVE_APP_TAB,
  LS_DATA_PREP_SUBTAB,
  normalizeAppTabKey,
  normalizeDataPrepSubtabKey
} from './utils/labNavigationState.js';
import { applyPageDefaultsToGlobalSettings, normalizeGlobalSettings } from './utils/globalSettings.js';
import {
  clearPageModelSelection,
  loadPageModelSelection,
  saveGlobalDefaultModelSelection,
  saveModelPresets,
  savePageModelSelection
} from './utils/modelPresetStorage.js';
import { getSelectedIndicatorTypes, isResultFound } from './utils/extraction.js';

const LS_SETTINGS = 'intelliextract_settings';
const TEST_SET_TAB_KEYS = new Set(['prompt-iteration', 'model-validation', 'prompt-optimization']);

function isTestSetTabKey(key) {
  return TEST_SET_TAB_KEYS.has(key);
}

function loadRawGlobalSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    }
  } catch (_) { /* ignore */ }
  return null;
}

function saveGlobalSettings(settings) {
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(normalizeGlobalSettings(settings))); } catch (_) { /* ignore */ }
}

const TestSetWorkbench = lazy(() => import('./components/TestSetWorkbench.jsx').then((module) => ({
  default: module.TestSetWorkbench
})));

function createInitialProgress() {
  return {
    visible: false,
    status: '',
    percentage: 0,
    logs: [],
    isLoading: false
  };
}

function validatePdfFile(file) {
  return file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
}

function validateRequirementsFile(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
}

function getFileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function loadActiveTab() {
  try {
    return normalizeAppTabKey(localStorage.getItem(LS_ACTIVE_APP_TAB));
  } catch (_) { /* ignore */ }
  return normalizeAppTabKey(null);
}

export default function App() {
  const initialModelPresetState = useMemo(
    () => initializeModelPresetSystem(),
    []
  );
  const platformConfig = usePlatformConfig();
  const visibleTabs = useMemo(
    () => getVisibleTopTabs(platformConfig.configAvailable ? platformConfig.config : null),
    [platformConfig.config, platformConfig.configAvailable]
  );
  const visibleDataPrepTools = useMemo(
    () => getVisibleDataPrepSubtabs(platformConfig.configAvailable ? platformConfig.config : null),
    [platformConfig.config, platformConfig.configAvailable]
  );
  const initialVisibilityAppliedRef = useRef(false);
  const [activeTab, setActiveTab] = useState(loadActiveTab);
  const [hasVisitedTestbench, setHasVisitedTestbench] = useState(() => isTestSetTabKey(loadActiveTab()));
  const [activeDataPrepSubtab, setActiveDataPrepSubtab] = useState(() => {
    try {
      return normalizeDataPrepSubtabKey(localStorage.getItem(LS_DATA_PREP_SUBTAB));
    } catch (_) { /* ignore */ }
    return 'chunking';
  });
  const initialRawSettings = useMemo(() => loadRawGlobalSettings(), []);
  const [settings, setSettings] = useState(() => normalizeGlobalSettings(initialRawSettings || DEFAULT_SETTINGS));
  const settingsDefaultsAppliedRef = useRef(false);
  const settingsTouchedRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promptAssetLibraryOpened, setPromptAssetLibraryOpened] = useState(false);
  const [modelPresets, setModelPresets] = useState(() => initialModelPresetState.presets);
  const [globalDefaultPresetId, setGlobalDefaultPresetId] = useState(() => initialModelPresetState.globalDefaultPresetId || '');
  const [onlineValidationPresetId, setOnlineValidationPresetId] = useState(() => (
    loadPageModelSelection(MODEL_PAGE_KEYS.ONLINE_VALIDATION)
  ));
  const [pdfFiles, setPdfFiles] = useState([]);
  const [requirementsFile, setRequirementsFile] = useState(null);
  const [promptAssetRequirements, setPromptAssetRequirements] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [progress, setProgress] = useState(createInitialProgress);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({});
  const [filterOnlyFound, setFilterOnlyFound] = useState(false);
  const resultsAnchorRef = useRef(null);
  const onlineAbortRef = useRef(null);
  const onlineStartLockRef = useRef(false);

  useRunningTaskGuard(PLATFORM_PAGE_KEYS.ONLINE_VALIDATION, isRunning);

  const selectedIndicatorTypes = useMemo(
    () => getSelectedIndicatorTypes(normalizeGlobalSettings(settings).indicatorTypes),
    [settings.indicatorTypes]
  );
  const onlineValidationPreset = useMemo(
    () => resolvePagePreset(
      MODEL_PAGE_KEYS.ONLINE_VALIDATION,
      modelPresets,
      { [MODEL_PAGE_KEYS.ONLINE_VALIDATION]: onlineValidationPresetId },
      globalDefaultPresetId
    ),
    [globalDefaultPresetId, modelPresets, onlineValidationPresetId]
  );
  const onlineValidationRuntimeConfig = useMemo(() => {
    const runtimeConfig = resolveRuntimeLlmConfig(onlineValidationPreset);
    return runtimeConfig ? {
      ...runtimeConfig,
      pageKey: PLATFORM_PAGE_KEYS.ONLINE_VALIDATION
    } : null;
  }, [onlineValidationPreset]);
  const onlineValidationCapabilityError = useMemo(
    () => getPresetCapabilityError(
      onlineValidationPreset,
      PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.ONLINE_VALIDATION]
    ),
    [onlineValidationPreset]
  );
  const displayedResults = useMemo(
    () => (filterOnlyFound ? results.filter(isResultFound) : results),
    [filterOnlyFound, results]
  );

  const canStart = Boolean(
    pdfFiles.length > 0 &&
    (requirementsFile || promptAssetRequirements.length > 0) &&
    onlineValidationRuntimeConfig?.credentialsReady &&
    onlineValidationRuntimeConfig?.modelName &&
    selectedIndicatorTypes.length > 0 &&
    !onlineValidationCapabilityError &&
    platformConfig.isPageEnabled(PLATFORM_PAGE_KEYS.ONLINE_VALIDATION)
  );

  useEffect(() => {
    try {
      localStorage.setItem(LS_ACTIVE_APP_TAB, activeTab);
    } catch (_) { /* ignore */ }
  }, [activeTab]);

  useEffect(() => {
    if (!platformConfig.configAvailable || settingsDefaultsAppliedRef.current) {
      return;
    }
    settingsDefaultsAppliedRef.current = true;
    if (settingsTouchedRef.current) {
      return;
    }

    const defaults = platformConfig.getPageDefaults(PLATFORM_PAGE_KEYS.ONLINE_VALIDATION);
    const next = applyPageDefaultsToGlobalSettings(initialRawSettings, defaults);
    setSettings(next);
    saveGlobalSettings(next);
  }, [initialRawSettings, platformConfig]);

  useEffect(() => {
    setModelPresets((previous) => mergePresetCollections(
      platformConfig.companyPresets,
      previous.filter((preset) => !isCompanyPreset(preset))
    ));
  }, [platformConfig.companyPresets]);

  useEffect(() => {
    if (!platformConfig.configAvailable || initialVisibilityAppliedRef.current) {
      return;
    }
    initialVisibilityAppliedRef.current = true;
    if (visibleTabs.length === 0) {
      return;
    }
    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      const fallbackTab = visibleTabs[0].key;
      setActiveTab(fallbackTab);
      if (isTestSetTabKey(fallbackTab)) {
        setHasVisitedTestbench(true);
      }
    }
  }, [activeTab, platformConfig.configAvailable, visibleTabs]);

  useEffect(() => {
    if (platformConfig.companyPresets.length === 0) {
      return;
    }
    setGlobalDefaultPresetId((previous) => {
      const allPresets = mergePresetCollections(platformConfig.companyPresets, modelPresets);
      if (previous && allPresets.some((preset) => preset.id === previous)) {
        return previous;
      }
      if (previous && String(previous).startsWith('company:')) {
        // 保留失效的公司选择，由页面提示重新选择，避免静默切换模型。
        return previous;
      }
      const fallback = platformConfig.companyPresets[0]?.id || '';
      if (fallback) {
        saveGlobalDefaultModelSelection(fallback);
      }
      return fallback;
    });
  }, [modelPresets, platformConfig.companyPresets]);

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

  const handleSettingChange = (key, value) => {
    settingsTouchedRef.current = true;
    setSettings((previous) => {
      const next = normalizeGlobalSettings({ ...previous, [key]: value });
      saveGlobalSettings(next);
      return next;
    });
  };

  const handleIndicatorTypeToggle = (type) => {
    settingsTouchedRef.current = true;
    setSettings((previous) => {
      const nextTypes = previous.indicatorTypes.includes(type)
        ? previous.indicatorTypes.filter((item) => item !== type)
        : [...previous.indicatorTypes, type];

      const next = {
        ...previous,
        indicatorTypes: nextTypes
      };
      const normalized = normalizeGlobalSettings(next);
      saveGlobalSettings(normalized);
      return normalized;
    });
  };

  const handlePdfSelect = (files) => {
    const nextFiles = Array.isArray(files) ? files : [files].filter(Boolean);

    if (nextFiles.length === 0) {
      return;
    }

    const invalidFile = nextFiles.find((file) => !validatePdfFile(file));

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

  const handlePdfRemove = (fileToRemove) => {
    const identity = getFileIdentity(fileToRemove);
    setPdfFiles((previous) => previous.filter((file) => getFileIdentity(file) !== identity));
  };

  const handleRequirementsSelect = (file) => {
    if (!validateRequirementsFile(file)) {
      window.alert('请上传有效的 Excel 或 CSV 文件。');
      return;
    }
    setRequirementsFile(file);
    setPromptAssetRequirements([]);
  };

  const handleSelectPromptAssetRequirements = (requirements) => {
    setPromptAssetRequirements(Array.isArray(requirements) ? requirements : []);
    setRequirementsFile(null);
  };

  const handleStopOnline = () => {
    if (!onlineAbortRef.current || !isRunning) {
      return;
    }
    setIsStopping(true);
    appendProgress({
      message: '已请求停止：等待当前模型请求返回，完成后保留已完成结果。',
      percentage: -1,
      timestamp: new Date().toLocaleTimeString()
    });
    onlineAbortRef.current.abort();
  };

  const handleStart = async () => {
    if (!platformConfig.isPageEnabled(PLATFORM_PAGE_KEYS.ONLINE_VALIDATION)) {
      window.alert('线上验证工作台当前已在后台关闭，不能启动新任务。');
      return;
    }
    if (!onlineValidationRuntimeConfig?.credentialsReady) {
      window.alert('当前模型凭据未就绪，请先在后台配置公司连接或补全个人 API Key。');
      return;
    }
    if (onlineStartLockRef.current || isRunning) {
      return;
    }

    // 同步锁和取消控制器都必须早于授权 await。
    onlineStartLockRef.current = true;
    const abortController = new AbortController();
    onlineAbortRef.current = abortController;
    setIsRunning(true);
    setIsStopping(false);
    setProgress({
      visible: true,
      status: needsCompanyRunAuthorization(onlineValidationRuntimeConfig)
        ? '正在获取公司模型运行授权...'
        : 'Starting file processing...',
      percentage: 0,
      logs: [],
      isLoading: true,
      hasFailure: false
    });

    let runId = '';
    if (needsCompanyRunAuthorization(onlineValidationRuntimeConfig)) {
      try {
        runId = await authorizeCompanyRun(PLATFORM_PAGE_KEYS.ONLINE_VALIDATION);
      } catch (error) {
        onlineStartLockRef.current = false;
        onlineAbortRef.current = null;
        setIsRunning(false);
        setIsStopping(false);
        setProgress((previous) => ({
          ...previous,
          status: `运行授权失败：${error instanceof Error ? error.message : '请稍后重试。'}`,
          isLoading: false
        }));
        window.alert(error instanceof Error ? error.message : '运行授权失败，请稍后重试。');
        return;
      }
    }

    if (abortController.signal.aborted) {
      onlineStartLockRef.current = false;
      onlineAbortRef.current = null;
      setIsRunning(false);
      setIsStopping(false);
      setProgress((previous) => ({
        ...previous,
        status: '已停止：授权请求结束后不再启动模型调用。',
        isLoading: false
      }));
      return;
    }

    setActiveTab('online-validation');
    setResults([]);
    setStats({});
    setFilterOnlyFound(false);
    setProgress({
      visible: true,
      status: 'Starting file processing...',
      percentage: 0,
      logs: [],
      isLoading: true,
      hasFailure: false
    });

    try {
      const totalFiles = pdfFiles.length;
      const startedAt = new Date();
      let aggregatedResults = [];
      let aggregatedStats = {
        model: onlineValidationRuntimeConfig?.modelName || '未配置模型',
        selectedTypes: selectedIndicatorTypes.join(', '),
        startTime: startedAt.toLocaleString(),
        endTime: '',
        duration: '',
        totalFiles,
        totalInputIndicators: 0,
        totalIndicators: 0,
        textCount: 0,
        numericCount: 0,
        intensityCount: 0,
        currencyCount: 0,
        totalBatches: 0,
        executedBatches: 0,
        startedBatches: 0,
        completedBatches: 0,
        startedIndicators: 0,
        completedIndicators: 0,
        unstartedIndicators: 0,
        foundIndicators: 0,
        failedBatches: 0,
        failedIndicators: 0,
        pdfTextFallbacks: 0,
        textBatches: 0,
        numericBatches: 0,
        intensityBatches: 0,
        currencyBatches: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        pricingConfigured: isPricingConfigured(onlineValidationRuntimeConfig?.modelName),
        failedFiles: 0
      };

      const enrichResultsWithFile = (items, fileName) => (
        (items || []).map((item) => ({
          source_file: fileName,
          ...item
        }))
      );

      let planInitialized = false;
      const failedFileDetails = [];

      for (let index = 0; index < pdfFiles.length; index += 1) {
        if (abortController.signal.aborted) {
          break;
        }
        const pdfFile = pdfFiles[index];

        appendProgress({
          message: `Preparing file ${index + 1}/${totalFiles}: ${pdfFile.name}`,
          percentage: Math.round((index / totalFiles) * 100),
          timestamp: new Date().toLocaleTimeString()
        });

        try {
          const response = await runExtractionJob({
            pdfFile,
            csvFile: requirementsFile,
            requirements: promptAssetRequirements.length > 0 ? promptAssetRequirements : undefined,
            settings: buildOnlineValidationRunSettings({
              baseSettings: settings,
              selectedIndicatorTypes,
              runtimeConfig: onlineValidationRuntimeConfig,
              runId
            }),
            onProgress: ({ message, percentage, timestamp }) => {
              const globalPercentage = percentage >= 0
                ? Math.min(100, Math.round(((index + (percentage / 100)) / totalFiles) * 100))
                : -1;

              appendProgress({
                message: `[${index + 1}/${totalFiles}] ${pdfFile.name}: ${message}`,
                percentage: globalPercentage,
                timestamp
              });
            },
            onPartialResults: (partialResults) => {
              setResults([
                ...aggregatedResults,
                ...enrichResultsWithFile(partialResults, pdfFile.name)
              ]);
            },
            signal: abortController.signal
          });

          const fileResults = enrichResultsWithFile(response.results, pdfFile.name);
          aggregatedResults = [...aggregatedResults, ...fileResults];
          setResults(aggregatedResults);

          const merged = mergeExtractionFileStats(
            aggregatedStats,
            response.stats,
            totalFiles,
            planInitialized
          );
          aggregatedStats = merged.stats;
          planInitialized = merged.planInitialized;
          aggregatedStats.pricingConfigured = aggregatedStats.pricingConfigured
            && response.stats.pricingConfigured !== false;
          if (abortController.signal.aborted) {
            break;
          }
        } catch (error) {
          aggregatedStats.failedFiles += 1;
          failedFileDetails.push({
            fileName: pdfFile.name,
            message: error instanceof Error ? error.message : String(error)
          });
          appendProgress({
            message: `[${index + 1}/${totalFiles}] ${pdfFile.name}: failed - ${error.message}`,
            percentage: Math.round(((index + 1) / totalFiles) * 100),
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      aggregatedStats.unstartedIndicators = Math.max(
        0,
        aggregatedStats.totalIndicators - aggregatedStats.startedIndicators
      );
      aggregatedStats.failedFileDetails = failedFileDetails;

      const endedAt = new Date();
      const durationMs = endedAt - startedAt;

      if (abortController.signal.aborted) {
        aggregatedStats = {
          ...aggregatedStats,
          endTime: endedAt.toLocaleString(),
          duration: `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
        };
        setResults(aggregatedResults);
        setStats(aggregatedStats);
        setProgress((previous) => ({
          ...previous,
          status: `已停止：保留已完成 ${aggregatedResults.length} 条结果${aggregatedStats.failedFiles > 0 ? `；${aggregatedStats.failedFiles} 个文件失败` : ''}。`,
          isLoading: false,
          hasFailure: aggregatedStats.failedFiles > 0 || aggregatedStats.failedIndicators > 0
        }));
        return;
      }

      aggregatedStats = {
        ...aggregatedStats,
        endTime: endedAt.toLocaleString(),
        duration: `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
      };

      setResults(aggregatedResults);
      setStats(aggregatedStats);
      setProgress((previous) => ({
        ...previous,
        status: aggregatedStats.failedFiles > 0
          ? `任务结束：成功文件 ${Math.max(0, totalFiles - aggregatedStats.failedFiles)} 个，失败文件 ${aggregatedStats.failedFiles} 个。`
          : `提取完成：保留 ${aggregatedResults.length} 条结果。`,
        isLoading: false,
        hasFailure: aggregatedStats.failedFiles > 0 || aggregatedStats.failedIndicators > 0
      }));
      resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      if (error?.name === 'AbortError' || abortController.signal.aborted) {
        setResults([]);
        setStats({});
        setProgress((previous) => ({
          ...previous,
          status: '本次提取已取消，未完成结果不会保存。',
          isLoading: false
        }));
        return;
      }
      console.error(error);
      appendProgress({
        message: `Error: ${error.message}`,
        percentage: 100,
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      onlineStartLockRef.current = false;
      onlineAbortRef.current = null;
      setIsRunning(false);
      setIsStopping(false);
      setProgress((previous) => ({
        ...previous,
        isLoading: false
      }));
    }
  };

  const changeTestSubtab = (nextSubtab) => {
    const nextTab = normalizeAppTabKey(nextSubtab);
    if (!isTestSetTabKey(nextTab) || nextTab === activeTab) {
      return;
    }
    // 测试集内部切页不打断正在运行的快速迭代；运行组件保持挂载。
    setActiveTab(nextTab);
  };

  const changeDataPrepSubtab = (nextSubtab) => {
    const normalizedSubtab = normalizeDataPrepSubtabKey(nextSubtab);
    if (normalizedSubtab === activeDataPrepSubtab) {
      return;
    }
    const currentPageKey = getPageKeyForDataPrepSubtab(activeDataPrepSubtab);
    if (currentPageKey && hasRunningTasks(currentPageKey)
      && !confirmNavigationIfRunning(currentPageKey)) {
      return;
    }
    setActiveDataPrepSubtab(normalizedSubtab);
  };

  const handleSelectDataPrepTool = (toolKey) => {
    const normalizedSubtab = normalizeDataPrepSubtabKey(toolKey);
    if (activeTab === 'data-prep') {
      changeDataPrepSubtab(normalizedSubtab);
      return;
    }
    setActiveDataPrepSubtab(normalizedSubtab);
    setActiveTab('data-prep');
  };

  return (
    <main className="container">
      <div className="background-blob blob-1" />
      <div className="background-blob blob-2" />
      <div className="background-blob blob-3" />

      <Header
        activeTab={activeTab}
        activeDataPrepSubtab={activeDataPrepSubtab}
        onTabChange={(tab) => {
          const nextTab = normalizeAppTabKey(tab);
          if (nextTab === activeTab) {
            return;
          }
          // 站内切页不打断运行；快速迭代/线上验证依赖显式停止。
          // 数据预处理工具切换仍保留运行确认。
          const interruptingScope = activeTab === 'data-prep'
            ? [PLATFORM_PAGE_KEYS.CHUNKING, PLATFORM_PAGE_KEYS.PDF_COMPRESS, PLATFORM_PAGE_KEYS.TOKEN_ESTIMATION]
            : null;
          if (interruptingScope && hasRunningTasks(interruptingScope)) {
            if (!confirmNavigationIfRunning(interruptingScope)) {
              return;
            }
          }
          if (isTestSetTabKey(nextTab)) setHasVisitedTestbench(true);
          setActiveTab(nextTab);
        }}
        onSelectDataPrepTool={handleSelectDataPrepTool}
        onOpenPromptAssetLibrary={() => {
          setHasVisitedTestbench(true);
          setPromptAssetLibraryOpened(true);
        }}
        visibleTabs={visibleTabs}
        visibleDataPrepTools={visibleDataPrepTools}
      />

      {platformConfig.loading ? (
        <div className="platform-config-banner">正在读取公司模型与页面配置...</div>
      ) : null}
      {platformConfig.error ? (
        <div className="platform-config-banner warning">
          公司模型配置暂时不可用：{platformConfig.error}个人预设仍可使用。
        </div>
      ) : null}
      <div ref={resultsAnchorRef} />

      {activeTab === 'online-validation' ? (
        <OnlineValidationWorkbench
          modelPresets={modelPresets}
          selectedPresetId={onlineValidationPreset?.id || onlineValidationPresetId}
          usesGlobalDefault={!onlineValidationPresetId}
          onSelectPreset={(presetId) => {
            setOnlineValidationPresetId(presetId);
            savePageModelSelection(MODEL_PAGE_KEYS.ONLINE_VALIDATION, presetId);
          }}
          onResetPreset={() => {
            setOnlineValidationPresetId('');
            clearPageModelSelection(MODEL_PAGE_KEYS.ONLINE_VALIDATION);
          }}
          onOpenModelPresetManager={() => setSettingsOpen(true)}
          onRefreshConfig={platformConfig.refresh}
          presetCapabilityError={onlineValidationCapabilityError}
          canStart={canStart}
          hasCredentials={Boolean(onlineValidationRuntimeConfig?.credentialsReady)}
          pageEnabled={platformConfig.isPageEnabled(PLATFORM_PAGE_KEYS.ONLINE_VALIDATION)}
          isRunning={isRunning}
          isStopping={isStopping}
          onStop={handleStopOnline}
          pdfFiles={pdfFiles}
          requirementsFile={requirementsFile}
          promptAssetRequirements={promptAssetRequirements}
          onSelectPromptAssetRequirements={handleSelectPromptAssetRequirements}
          onClearPromptAssetRequirements={() => setPromptAssetRequirements([])}
          onSelectPdf={handlePdfSelect}
          onRemovePdf={handlePdfRemove}
          onSelectRequirements={handleRequirementsSelect}
          onStart={handleStart}
          progress={progress}
          results={results}
          displayedResults={displayedResults}
          filterOnlyFound={filterOnlyFound}
          onToggleFilter={setFilterOnlyFound}
          onExport={() => {
            void exportResultsToExcel(results, stats);
          }}
          stats={stats}
          settings={settings}
          onChangeSetting={handleSettingChange}
          onIndicatorTypeToggle={handleIndicatorTypeToggle}
        />
      ) : activeTab === 'data-prep' ? (
        <DataPreprocessingWorkbench
          globalSettings={settings}
          modelPresets={modelPresets}
          globalDefaultPresetId={globalDefaultPresetId}
          onOpenModelPresetManager={() => setSettingsOpen(true)}
          activeSubtab={activeDataPrepSubtab}
          onSubtabChange={changeDataPrepSubtab}
        />
      ) : activeTab === 'docs' ? (
        platformConfig.isPageEnabled(PLATFORM_PAGE_KEYS.DOCS) ? (
          <MethodologyTab />
        ) : (
          <>
            <div className="closed-page-content" inert>
              <MethodologyTab />
            </div>
            <ClosedPageOverlay
              pageLabel="说明文档"
              onRefresh={platformConfig.refresh}
            />
          </>
        )
      ) : null}

      {/* 测试集工作台首次访问后持续挂载，防止切换 tab 时运行状态丢失 */}
      {hasVisitedTestbench && (
        <div style={{ display: isTestSetTabKey(activeTab) ? 'block' : 'none' }}>
          <Suspense fallback={<section className="glass-panel main-panel"><p className="section-caption">正在加载测试集工作台...</p></section>}>
            <TestSetWorkbench
              globalSettings={settings}
              modelPresets={modelPresets}
              globalDefaultPresetId={globalDefaultPresetId}
              onOpenModelPresetManager={() => setSettingsOpen(true)}
              activeSubtab={isTestSetTabKey(activeTab) ? activeTab : undefined}
              onSubtabChange={changeTestSubtab}
              promptAssetLibraryOpened={promptAssetLibraryOpened}
              onPromptAssetLibraryClose={() => setPromptAssetLibraryOpened(false)}
              onOpenPromptAssetLibrary={() => {
                setHasVisitedTestbench(true);
                setPromptAssetLibraryOpened(true);
              }}
            />
          </Suspense>
        </div>
      )}

      <LLMSettingsDrawer
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        presets={modelPresets}
        onChangePresets={(nextPresets) => {
          const customPresets = filterPersistablePresets(nextPresets);
          const mergedPresets = mergePresetCollections(platformConfig.companyPresets, customPresets);
          setModelPresets(mergedPresets);
          saveModelPresets(customPresets);
          const hasCurrentGlobalDefault = mergedPresets.some((item) => item.id === globalDefaultPresetId);
          if (!hasCurrentGlobalDefault) {
            const fallbackPresetId = platformConfig.companyPresets[0]?.id
              || customPresets.find((item) => item.isDefault)?.id
              || customPresets[0]?.id
              || '';
            setGlobalDefaultPresetId(fallbackPresetId);
            saveGlobalDefaultModelSelection(fallbackPresetId);
          }
        }}
      />
    </main>
  );
}
