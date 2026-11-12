import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@mantine/core';
import { IconPlayerPlayFilled, IconRefresh } from '@tabler/icons-react';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from '../constants/modelPresets.js';
import { PLATFORM_PAGE_KEYS } from '../constants/platformPages.js';
import { usePlatformConfig } from './PlatformConfigProvider.jsx';
import { authorizeCompanyRun, needsCompanyRunAuthorization } from '../services/runAuthorizationService.js';
import { useRunningTaskGuard } from '../utils/runningTaskGuard.js';
import { DEFAULT_LLM1_SETTINGS } from '../constants/testBench.js';
import {
  getPromptIterationDraft,
  getPromptIterationHistory,
  restorePromptIterationDraftFiles,
  savePromptIterationDraft,
  savePromptIterationDraftFiles,
  savePromptIterationHistory
} from '../services/persistenceService.js';
import { resolveSettingsWithPlatformDefaults } from '../utils/platformDefaultModel.js';
import { buildPromptAssetSelectOptions, detectPromptIterationFileKind } from '../utils/promptIterationModel.js';
import {
  runPromptIteration,
  clipPromptIterationHistory,
  removePromptIterationHistoryAt,
  normalizePromptIterationDraft,
  supportsPromptIterationPdfProvider
} from '../services/promptIterationService.js';
import { savePromptAssetVersion } from '../services/promptAssetLibraryService.js';
import { getStandardSystemPromptForValueType, isStandardSystemPrompt } from '../services/llmClient.js';
import { resolvePagePreset, resolveRuntimeLlmConfig } from '../services/modelPresetResolver.js';
import {
  clearPageModelSelection,
  loadPageModelSelection,
  savePageModelSelection
} from '../utils/modelPresetStorage.js';
import { PagePresetQuickSwitch } from './modelPresets/PagePresetQuickSwitch.jsx';
import { PromptIterationConfigPanel } from './promptIteration/PromptIterationConfigPanel.jsx';
import { PromptIterationFileList } from './promptIteration/PromptIterationFileList.jsx';
import { PromptIterationResultsPanel } from './promptIteration/PromptIterationResultsPanel.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';

function hasAttachedFile(item) {
  return Boolean(item?.file && typeof item.file.arrayBuffer === 'function');
}

function createFallbackPromptIterationSettings() {
  return {
    ...resolveSettingsWithPlatformDefaults({
      ...DEFAULT_LLM1_SETTINGS,
      apiKey: ''
    }),
    credentialsReady: false
  };
}

function createInitialProgress() {
  return {
    visible: false,
    status: '',
    percentage: 0,
    logs: [],
    isLoading: false
  };
}

export function FullFlowMode({ vm, modelPresets = [], globalDefaultPresetId = '' }) {
  const { isPageEnabled, getPageDefaults } = usePlatformConfig();
  const pageEnabled = isPageEnabled(PLATFORM_PAGE_KEYS.PROMPT_ITERATION);
  const pageDefaults = getPageDefaults(PLATFORM_PAGE_KEYS.PROMPT_ITERATION);
  const [draft, setDraft] = useState(() => normalizePromptIterationDraft(null));
  const [selectedPresetId, setSelectedPresetId] = useState(() => loadPageModelSelection(MODEL_PAGE_KEYS.PROMPT_ITERATION));
  const [history, setHistory] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState('current');
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingPromptAsset, setIsSavingPromptAsset] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);
  const [progress, setProgress] = useState(createInitialProgress);
  const mountedRef = useRef(true);
  const runLockRef = useRef(false);
  const runAbortRef = useRef(null);
  useRunningTaskGuard(PLATFORM_PAGE_KEYS.PROMPT_ITERATION, isRunning);

  useEffect(() => {
    // StrictMode 会执行一次“挂载→清理→重新挂载”，需在挂载时重置标记
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runAbortRef.current?.abort();
    };
  }, []);

  const hasPdfFiles = useMemo(
    () => draft.files.some((item) => detectPromptIterationFileKind(item) === 'pdf'),
    [draft.files]
  );
  const hasImageFiles = useMemo(
    () => draft.files.some((item) => detectPromptIterationFileKind(item) === 'image'),
    [draft.files]
  );
  // PDF 可以自动提取文本；只有图片输入才必须要求多模态直传能力。
  const requiredCapabilities = useMemo(
    () => (hasImageFiles
      ? PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.PROMPT_ITERATION]
      : { supportsJsonMode: true }),
    [hasImageFiles]
  );

  const selectedPreset = useMemo(
    () => resolvePagePreset(
      MODEL_PAGE_KEYS.PROMPT_ITERATION,
      modelPresets,
      { [MODEL_PAGE_KEYS.PROMPT_ITERATION]: selectedPresetId },
      globalDefaultPresetId
    ),
    [globalDefaultPresetId, modelPresets, selectedPresetId]
  );
  const runtimePresetSettings = useMemo(() => {
    const runtimeConfig = resolveRuntimeLlmConfig(selectedPreset);
    return runtimeConfig ? {
      ...runtimeConfig,
      pageKey: PLATFORM_PAGE_KEYS.PROMPT_ITERATION,
      maxRetries: Number(pageDefaults.maxRetries) || 3
    } : null;
  }, [pageDefaults.maxRetries, selectedPreset]);
  const selectedAssetIds = useMemo(() => {
    if (Array.isArray(draft.selectedPromptAssetIds) && draft.selectedPromptAssetIds.length > 0) {
      return draft.selectedPromptAssetIds;
    }
    return draft.promptAssetId ? [draft.promptAssetId] : [];
  }, [draft.selectedPromptAssetIds, draft.promptAssetId]);

  const lockedValueType = useMemo(() => {
    if (selectedAssetIds.length === 0) return '';
    const firstEntry = (vm?.promptAssetEntries || []).find((e) => e.asset.id === selectedAssetIds[0]);
    return firstEntry?.asset?.valueType || draft.promptValueType || '';
  }, [selectedAssetIds, draft.promptValueType, vm?.promptAssetEntries]);

  const selectedIndicatorsList = useMemo(() => {
    return selectedAssetIds.map((assetId) => {
      const entry = (vm?.promptAssetEntries || []).find((e) => e.asset.id === assetId);
      return {
        id: assetId,
        name: entry?.asset?.indicatorName || entry?.asset?.name || '未命名指标',
        code: entry?.asset?.indicatorCode || '',
        valueType: entry?.asset?.valueType || lockedValueType || '文字型'
      };
    });
  }, [selectedAssetIds, vm?.promptAssetEntries, lockedValueType]);

  const activeAssetId = draft.activeAssetId || selectedAssetIds[0] || draft.promptAssetId || '';
  const activeIndicatorName = useMemo(() => {
    const found = selectedIndicatorsList.find((item) => item.id === activeAssetId);
    return found?.name || draft.name || '';
  }, [selectedIndicatorsList, activeAssetId, draft.name]);

  const selectedPromptAssetEntry = useMemo(
    () => (vm?.promptAssetEntries || []).find((entry) => entry.asset.id === (activeAssetId || draft.promptAssetId)) || null,
    [activeAssetId, draft.promptAssetId, vm?.promptAssetEntries]
  );
  const promptAssetOptions = useMemo(
    () => buildPromptAssetSelectOptions(vm?.promptAssetEntries || [], draft, {
      includeDraft: true,
      lockedValueType
    }),
    [draft, vm?.promptAssetEntries, lockedValueType]
  );
  const promptVersionOptions = useMemo(
    () => (selectedPromptAssetEntry?.versions || []).map((version) => ({
      value: version.id,
      label: `${version.label || '未命名版本'} · ${new Date(version.createdAt || Date.now()).toLocaleString('zh-CN', { hour12: false })}`
    })),
    [selectedPromptAssetEntry]
  );
  const effectiveLlmSettings = useMemo(() => {
    const fallback = createFallbackPromptIterationSettings();
    return runtimePresetSettings
      ? {
          ...fallback,
          ...runtimePresetSettings
        }
      : fallback;
  }, [runtimePresetSettings]);

  const persistedDraft = useMemo(
    () => normalizePromptIterationDraft(draft),
    [draft]
  );
  const supportsPdfUpload = useMemo(
    () => supportsPromptIterationPdfProvider(effectiveLlmSettings),
    [effectiveLlmSettings]
  );
  const requiresPdfUpload = hasImageFiles;

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      const savedDraft = await restorePromptIterationDraftFiles(await getPromptIterationDraft());
      const savedHistory = clipPromptIterationHistory(await getPromptIterationHistory());

      if (isCancelled) {
        return;
      }

      setDraft(savedDraft);
      setHistory(savedHistory);
      setHasHydrated(true);
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    savePromptIterationDraft(persistedDraft).catch(() => {});
  }, [persistedDraft, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    savePromptIterationDraftFiles(draft.files).catch(() => {});
  }, [draft.files, hasHydrated]);

  useEffect(() => {
    if (!vm?.incomingPromptIterationSeed) {
      return;
    }

    setDraft((previous) => normalizePromptIterationDraft({
      ...previous,
      ...vm.incomingPromptIterationSeed
    }, { preserveFiles: true }));
    setCurrentRun(null);
    setActiveResultTab('current');
    setErrorMsg('');
    vm.onConsumePromptIterationSeed?.();
  }, [vm?.incomingPromptIterationSeed]);

  const runnableFiles = useMemo(
    () => draft.files.filter((item) => hasAttachedFile(item)),
    [draft.files]
  );

  const missingFileCount = useMemo(
    () => draft.files.filter((item) => !hasAttachedFile(item)).length,
    [draft.files]
  );

  const canRun = Boolean(
    runnableFiles.length > 0 &&
    (draft.systemPrompt.trim() || draft.userPrompt.trim()) &&
    effectiveLlmSettings.credentialsReady &&
    effectiveLlmSettings.modelName &&
    (effectiveLlmSettings.serverManaged || effectiveLlmSettings.apiUrl) &&
    (!requiresPdfUpload || supportsPdfUpload) &&
    pageEnabled &&
    !isRunning
  );
  const canSavePromptAsset = Boolean(
    draft.userPrompt.trim() &&
    (draft.promptAssetId || draft.promptIndicatorCode.trim()) &&
    !isRunning &&
    !isSavingPromptAsset
  );

  const handleRun = async () => {
    if (!pageEnabled) {
      window.alert('Prompt 快速迭代当前已在后台关闭，不能启动新任务。');
      return;
    }
    if (!canRun || runLockRef.current) {
      return;
    }

    // 同步锁必须早于第一个 await，避免授权等待期间双击启动多个任务。
    runLockRef.current = true;
    setIsRunning(true);
    setErrorMsg('');
    setProgress({
      visible: true,
      status: needsCompanyRunAuthorization(effectiveLlmSettings) ? '正在获取公司模型运行授权...' : '开始 Prompt 快速验证...',
      percentage: 0,
      logs: [],
      isLoading: true
    });

    const abortController = new AbortController();
    runAbortRef.current = abortController;

    try {
      let runId = '';
      if (needsCompanyRunAuthorization(effectiveLlmSettings)) {
        runId = await authorizeCompanyRun(PLATFORM_PAGE_KEYS.PROMPT_ITERATION);
      }
      if (abortController.signal.aborted) {
        return;
      }

      setProgress((previous) => ({
        ...previous,
        status: '开始 Prompt 快速验证...',
        isLoading: true
      }));

      const runnableIndicators = selectedAssetIds.map((assetId) => {
        const entry = (vm?.promptAssetEntries || []).find((e) => e.asset.id === assetId);
        const custom = draft.indicatorPrompts?.[assetId];
        return {
          code: entry?.asset?.indicatorCode || '',
          name: entry?.asset?.indicatorName || entry?.asset?.name || '',
          valueType: entry?.asset?.valueType || lockedValueType || '文字型',
          userPrompt: custom?.userPrompt !== undefined
            ? custom.userPrompt
            : (entry?.latestVersion?.userPromptTemplate || entry?.asset?.userPrompt || '')
        };
      });

      const run = await runPromptIteration({
        ...draft,
        indicators: runnableIndicators.length > 0 ? runnableIndicators : undefined,
        promptValueType: lockedValueType || draft.promptValueType,
        signal: abortController.signal,
        files: runnableFiles.map((item) => ({ ...item, file: item.file })),
        llmSettings: { ...effectiveLlmSettings, runId },
        onProgress: (entry) => {
          setProgress((previous) => ({
            visible: true,
            status: entry.message || previous.status,
            percentage: entry.percentage >= 0 ? entry.percentage : previous.percentage,
            logs: [
              ...previous.logs,
              {
                id: `${Date.now()}-${Math.random()}`,
                time: entry.timestamp || new Date().toLocaleTimeString(),
                message: entry.message
              }
            ],
            isLoading: entry.percentage >= 0 ? entry.percentage < 100 : previous.isLoading
          }));
        }
      });

      if (!mountedRef.current) {
        return;
      }

      const nextHistory = clipPromptIterationHistory([run, ...history]);
      setCurrentRun(run);
      setHistory(nextHistory);
      setActiveResultTab('current');
      await savePromptIterationHistory(nextHistory);
      setProgress((previous) => ({
        ...previous,
        status: `验证完成：成功 ${run.summary?.successCount || 0}/${run.summary?.total || 0}`,
        percentage: 100,
        isLoading: false
      }));
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setErrorMsg(message);
      setProgress((previous) => ({
        ...previous,
        visible: true,
        status: `运行失败：${message}`,
        percentage: 100,
        logs: [
          ...previous.logs,
          {
            id: `${Date.now()}-${Math.random()}`,
            time: new Date().toLocaleTimeString(),
            message: `运行失败：${message}`
          }
        ],
        isLoading: false
      }));
    } finally {
      runAbortRef.current = null;
      runLockRef.current = false;
      setIsRunning(false);
    }
  };

  const handleSavePromptAsset = async () => {
    if (!canSavePromptAsset) {
      return;
    }

    const isNewDraft = !draft.promptAssetId && Boolean(draft.promptIndicatorCode?.trim());
    const targetAssetId = isNewDraft ? '' : (draft.activeAssetId || draft.promptAssetId);
    const activeEntry = targetAssetId
      ? (vm?.promptAssetEntries || []).find((e) => e.asset.id === targetAssetId)
      : null;
    const activeVersion = activeEntry?.latestVersion || activeEntry?.versions?.[0] || null;

    if (activeVersion && !isNewDraft) {
      const currentType = activeEntry?.asset?.valueType || draft.promptValueType || '文字型';
      const baselineUserPrompt = String(activeVersion.userPromptTemplate || '').trim();
      const currentUserPrompt = String(draft.userPrompt || '').trim();

      const defaultSystemPrompt = getStandardSystemPromptForValueType(currentType);
      const baselineSystemPrompt = String(activeVersion.systemPrompt || defaultSystemPrompt || '').trim();
      const currentSystemPrompt = String(draft.systemPrompt || '').trim();

      const isUserPromptChanged = currentUserPrompt !== baselineUserPrompt;
      const isSystemPromptChanged = currentSystemPrompt !== baselineSystemPrompt &&
        currentSystemPrompt !== String(activeVersion.systemPrompt || '').trim();

      if (!isUserPromptChanged && !isSystemPromptChanged) {
        window.alert('提示词内容未发生变化，无需写入新版本。');
        return;
      }
    }

    setIsSavingPromptAsset(true);
    setErrorMsg('');
    try {
      const result = await savePromptAssetVersion({
        assetId: isNewDraft ? '' : targetAssetId,
        indicatorCode: isNewDraft ? draft.promptIndicatorCode.trim() : (activeEntry?.asset?.indicatorCode || draft.promptIndicatorCode),
        indicatorName: isNewDraft ? draft.name.trim() : (activeEntry?.asset?.indicatorName || activeEntry?.asset?.name || draft.name),
        valueType: draft.promptValueType || activeEntry?.asset?.valueType || '文字型',
        systemPrompt: draft.systemPrompt,
        userPromptTemplate: draft.userPrompt,
        label: isNewDraft ? '初始版本' : '快速迭代写回',
        sourceType: isNewDraft ? 'manual' : 'iterated'
      });
      await vm?.onPromptAssetsChanged?.();
      if (!isNewDraft && !result.createdVersion) {
        window.alert('提示词内容未发生变化，无需写入新版本。');
        return;
      }
      setDraft((previous) => {
        const nextSelectedIds = isNewDraft
          ? [result.asset.id]
          : (Array.isArray(previous.selectedPromptAssetIds) && previous.selectedPromptAssetIds.length > 0
            ? previous.selectedPromptAssetIds
            : [result.asset.id]);

        return normalizePromptIterationDraft({
          ...previous,
          promptAssetId: result.asset.id,
          promptVersionId: result.version?.id || previous.promptVersionId,
          activeAssetId: result.asset.id,
          selectedPromptAssetIds: nextSelectedIds,
          promptIndicatorCode: result.asset.indicatorCode || previous.promptIndicatorCode,
          name: result.asset.indicatorName || result.asset.name || previous.name,
          promptValueType: result.asset.valueType || previous.promptValueType
        }, { preserveFiles: true });
      });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingPromptAsset(false);
    }
  };

  const handleSelectPromptAssets = (nextAssetIds) => {
    const limitedIds = (Array.isArray(nextAssetIds) ? nextAssetIds : []).slice(0, 20);
    if (limitedIds.length === 0) {
      setDraft((previous) => normalizePromptIterationDraft({
        ...previous,
        selectedPromptAssetIds: [],
        activeAssetId: '',
        promptAssetId: '',
        promptIndicatorCode: '',
        name: '',
        promptValueType: '',
        userPrompt: '',
        systemPrompt: '',
        indicatorPrompts: {}
      }, { preserveFiles: true }));
      return;
    }

    const newActiveId = limitedIds.includes(draft.activeAssetId) ? draft.activeAssetId : limitedIds[0];
    const activeEntry = (vm?.promptAssetEntries || []).find((e) => e.asset.id === newActiveId);
    const firstEntry = (vm?.promptAssetEntries || []).find((e) => e.asset.id === limitedIds[0]);
    const resolvedLockedType = firstEntry?.asset?.valueType || activeEntry?.asset?.valueType || '文字型';

    const activeVersion = activeEntry?.latestVersion || activeEntry?.versions?.[0];
    const customPrompt = draft.indicatorPrompts?.[newActiveId]?.userPrompt;
    const effectiveUserPrompt = customPrompt !== undefined ? customPrompt : (activeVersion?.userPromptTemplate || '');

    setDraft((previous) => {
      const prevSelected = Array.isArray(previous.selectedPromptAssetIds) ? previous.selectedPromptAssetIds : [];
      const isNewBatch = prevSelected.length === 0;
      const isTypeChanged = Boolean(previous.promptValueType && previous.promptValueType !== resolvedLockedType);

      let effectiveSystemPrompt = '';

      if (isNewBatch || isTypeChanged) {
        // 新选指标批次开始，或指标类型改变：
        // 优先使用当前资产基线自定义系统提示词；
        // 若无自定义且当前提示词为旧类型的标准模板或为空，则载入新类型的标准系统模板；
        // 绝不混入旧类型的标准输出格式
        if (activeVersion?.systemPrompt?.trim()) {
          effectiveSystemPrompt = activeVersion.systemPrompt;
        } else if (!previous.systemPrompt?.trim() || isStandardSystemPrompt(previous.systemPrompt) || isTypeChanged) {
          effectiveSystemPrompt = getStandardSystemPromptForValueType(resolvedLockedType);
        } else {
          effectiveSystemPrompt = previous.systemPrompt;
        }
      } else {
        // 同一批次内（同类型）增减成员：整批共享，保留当前正在编辑的系统提示词
        effectiveSystemPrompt = previous.systemPrompt?.trim()
          ? previous.systemPrompt
          : (activeVersion?.systemPrompt || getStandardSystemPromptForValueType(resolvedLockedType));
      }

      return normalizePromptIterationDraft({
        ...previous,
        selectedPromptAssetIds: limitedIds,
        activeAssetId: newActiveId,
        promptAssetId: newActiveId,
        promptVersionId: activeVersion?.id || '',
        promptIndicatorCode: activeEntry?.asset?.indicatorCode || '',
        name: activeEntry?.asset?.indicatorName || activeEntry?.asset?.name || '',
        promptValueType: resolvedLockedType,
        userPrompt: effectiveUserPrompt,
        systemPrompt: effectiveSystemPrompt
      }, { preserveFiles: true });
    });
  };

  const handleSelectActiveAsset = (assetId) => {
    const activeEntry = (vm?.promptAssetEntries || []).find((e) => e.asset.id === assetId);
    const activeVersion = activeEntry?.latestVersion || activeEntry?.versions?.[0];
    const customPrompt = draft.indicatorPrompts?.[assetId]?.userPrompt;
    const effectiveUserPrompt = customPrompt !== undefined ? customPrompt : (activeVersion?.userPromptTemplate || '');

    setDraft((previous) => ({
      ...previous,
      activeAssetId: assetId,
      promptAssetId: assetId,
      promptVersionId: activeVersion?.id || previous.promptVersionId,
      promptIndicatorCode: activeEntry?.asset?.indicatorCode || previous.promptIndicatorCode,
      name: activeEntry?.asset?.indicatorName || activeEntry?.asset?.name || previous.name,
      userPrompt: effectiveUserPrompt,
      // 方案 A（整批共享）：切换查看不同指标时，系统提示词始终保持当前批次的编辑状态，绝不覆盖
      systemPrompt: previous.systemPrompt
    }));
  };

  const handleDraftChange = (updater) => {
    setDraft((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      const currentActiveId = next.activeAssetId || next.promptAssetId;
      if (currentActiveId && next.userPrompt !== previous.userPrompt) {
        return {
          ...next,
          indicatorPrompts: {
            ...(next.indicatorPrompts || {}),
            [currentActiveId]: {
              userPrompt: next.userPrompt
            }
          }
        };
      }
      return next;
    });
  };

  const handleDeleteHistoryRun = async (index) => {
    if (isRunning) {
      return;
    }
    const nextHistory = removePromptIterationHistoryAt(history, index);
    setHistory(nextHistory);
    await savePromptIterationHistory(nextHistory);
  };

  const handleClearHistory = async () => {
    if (isRunning || history.length === 0) {
      return;
    }
    if (!window.confirm('确定清空全部 Prompt 快速迭代历史记录？')) {
      return;
    }
    setHistory([]);
    await savePromptIterationHistory([]);
  };

  return (
    <section className="prompt-iteration-panel">
      <div className="testbench-subpage-toolbar">
        <PagePresetQuickSwitch
          presets={modelPresets}
          preset={selectedPreset}
          value={selectedPreset?.id || selectedPresetId}
          requiredCapabilities={requiredCapabilities}
          usesGlobalDefault={!selectedPresetId}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            savePageModelSelection(MODEL_PAGE_KEYS.PROMPT_ITERATION, presetId);
          }}
          onResetToGlobalDefault={() => {
            setSelectedPresetId('');
            clearPageModelSelection(MODEL_PAGE_KEYS.PROMPT_ITERATION);
          }}
          onOpenModelPresetManager={vm?.onOpenSettings}
          disabled={isRunning}
        />
      </div>

      {missingFileCount > 0 ? (
        <div className="prompt-iteration-hint-banner">
          已恢复 {missingFileCount} 条文件配置，但浏览器未保留对应文件句柄。重新上传后才能继续运行。
        </div>
      ) : null}

      {!pageEnabled ? (
        <div className="prompt-iteration-hint-banner warning">
          本页已在后台关闭，不能启动新任务；已经运行的任务可以继续完成。
        </div>
      ) : null}

      {!effectiveLlmSettings.credentialsReady ? (
        <div className="prompt-iteration-hint-banner warning">
          当前模型凭据未就绪。个人预设需要补全 API Key，公司预设需要管理员配置可用连接。
        </div>
      ) : null}

      {requiresPdfUpload && !supportsPdfUpload ? (
        <div className="prompt-iteration-hint-banner warning">
          当前文件包含图片，图片输入需要模型支持多模态直传。请切换到支持该能力的模型预设，或移除图片后运行。
        </div>
      ) : null}
      {hasPdfFiles && !supportsPdfUpload ? (
        <div className="prompt-iteration-hint-banner">
          当前模型不支持 PDF 直传，运行时会先提取 PDF 文本再发送；扫描件可能无法提取到文字。
        </div>
      ) : null}

      <PromptIterationConfigPanel
        draft={draft}
        onDraftChange={handleDraftChange}
        llmSettings={effectiveLlmSettings}
        presetName={selectedPreset?.name}
        requiresPdfUpload={requiresPdfUpload}
        supportsPdfUpload={supportsPdfUpload}
        promptAssetOptions={promptAssetOptions}
        promptVersionOptions={promptVersionOptions}
        selectedPromptAssetId={draft.promptAssetId}
        selectedPromptVersionId={draft.promptVersionId}
        selectedAssetIds={selectedAssetIds}
        onSelectPromptAssets={handleSelectPromptAssets}
        lockedValueType={lockedValueType}
        activeAssetId={activeAssetId}
        onSelectActiveAsset={handleSelectActiveAsset}
        activeIndicatorName={activeIndicatorName}
        selectedIndicatorsList={selectedIndicatorsList}
        onSelectPromptAsset={(assetId) => handleSelectPromptAssets(assetId ? [assetId] : [])}
        onSelectPromptVersion={(versionId) => {
          const version = selectedPromptAssetEntry?.versions?.find((item) => item.id === versionId) || null;
          setDraft((previous) => normalizePromptIterationDraft({
            ...previous,
            systemPrompt: version?.systemPrompt || previous.systemPrompt,
            userPrompt: version?.userPromptTemplate || previous.userPrompt,
            promptVersionId: version?.id || '',
            promptIndicatorCode: selectedPromptAssetEntry?.asset?.indicatorCode || previous.promptIndicatorCode,
            promptValueType: selectedPromptAssetEntry?.asset?.valueType || previous.promptValueType
          }, { preserveFiles: true }));
        }}
        onOpenPromptAssetLibrary={vm?.onOpenPromptAssetLibrary}
        onSavePromptAsset={handleSavePromptAsset}
        canSavePromptAsset={canSavePromptAsset}
        isSavingPromptAsset={isSavingPromptAsset}
        filesPanel={(
          <PromptIterationFileList
            draft={draft}
            onDraftChange={setDraft}
            compact
          />
        )}
      />

      <div className="prompt-iteration-actions">
        <Button
          leftSection={<IconPlayerPlayFilled size={16} />}
          disabled={!canRun}
          onClick={handleRun}
        >
          {isRunning ? '运行中...' : '开始验证'}
        </Button>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          onClick={() => {
            setCurrentRun(null);
            setErrorMsg('');
          }}
          disabled={isRunning}
        >
          清空当前结果
        </Button>
      </div>

      <ProgressPanel progress={progress} eyebrow="Prompt 快速迭代" title="运行进度" maxLogs={8} />

      <PromptIterationResultsPanel
        activeTab={activeResultTab}
        onTabChange={setActiveResultTab}
        currentRun={currentRun}
        history={history}
        errorMsg={errorMsg}
        onDeleteHistoryRun={handleDeleteHistoryRun}
        onClearHistory={handleClearHistory}
        historyActionsDisabled={isRunning}
      />
    </section>
  );
}
