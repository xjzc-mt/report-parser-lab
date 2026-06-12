import { useEffect, useMemo, useState } from 'react';
import { Button } from '@mantine/core';
import { IconPlayerPlayFilled, IconRefresh } from '@tabler/icons-react';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from '../constants/modelPresets.js';
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
  return resolveSettingsWithPlatformDefaults({
    ...DEFAULT_LLM1_SETTINGS,
    apiKey: ''
  });
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
  const hasMultimodalBinaryFiles = useMemo(
    () => draft.files.some((item) => ['pdf', 'image'].includes(detectPromptIterationFileKind(item))),
    [draft.files]
  );
  const requiredCapabilities = useMemo(
    () => (hasMultimodalBinaryFiles
      ? PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.PROMPT_ITERATION]
      : { supportsJsonMode: true }),
    [hasMultimodalBinaryFiles]
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
  const runtimePresetSettings = useMemo(
    () => resolveRuntimeLlmConfig(selectedPreset),
    [selectedPreset]
  );
  const selectedPromptAssetEntry = useMemo(
    () => (vm?.promptAssetEntries || []).find((entry) => entry.asset.id === draft.promptAssetId) || null,
    [draft.promptAssetId, vm?.promptAssetEntries]
  );
  const promptAssetOptions = useMemo(
    () => buildPromptAssetSelectOptions(vm?.promptAssetEntries || [], draft, { includeDraft: true }),
    [draft, vm?.promptAssetEntries]
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
  }, [runtimePresetSettings, vm]);

  const persistedDraft = useMemo(
    () => normalizePromptIterationDraft(draft),
    [draft]
  );
  const supportsPdfUpload = useMemo(
    () => supportsPromptIterationPdfProvider(effectiveLlmSettings),
    [effectiveLlmSettings]
  );
  const requiresPdfUpload = hasMultimodalBinaryFiles;

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
    effectiveLlmSettings.apiKey &&
    effectiveLlmSettings.modelName &&
    effectiveLlmSettings.apiUrl &&
    (!requiresPdfUpload || supportsPdfUpload) &&
    !isRunning
  );
  const canSavePromptAsset = Boolean(
    draft.userPrompt.trim() &&
    (draft.promptAssetId || draft.promptIndicatorCode.trim()) &&
    !isRunning &&
    !isSavingPromptAsset
  );

  const handleRun = async () => {
    if (!canRun) {
      return;
    }

    setIsRunning(true);
    setErrorMsg('');
    setProgress({
      visible: true,
      status: '开始 Prompt 快速验证...',
      percentage: 0,
      logs: [],
      isLoading: true
    });

    try {
      const run = await runPromptIteration({
        ...draft,
        files: runnableFiles.map((item) => ({ ...item, file: item.file })),
        llmSettings: effectiveLlmSettings,
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
      setIsRunning(false);
    }
  };

  const handleSavePromptAsset = async () => {
    if (!canSavePromptAsset) {
      return;
    }

    setIsSavingPromptAsset(true);
    setErrorMsg('');
    try {
      const result = await savePromptAssetVersion({
        assetId: draft.promptAssetId,
        indicatorCode: draft.promptIndicatorCode,
        indicatorName: draft.name,
        systemPrompt: draft.systemPrompt,
        userPromptTemplate: draft.userPrompt,
        label: '快速迭代写回',
        sourceType: 'iterated'
      });
      await vm?.onPromptAssetsChanged?.();
      if (!result.createdVersion) {
        window.alert('未有任何变化，不需要写入新的 Prompt 版本。');
      }
      setDraft((previous) => normalizePromptIterationDraft({
        ...previous,
        promptAssetId: result.asset.id,
        promptVersionId: result.version?.id || previous.promptVersionId,
        promptIndicatorCode: result.asset.indicatorCode || previous.promptIndicatorCode
      }, { preserveFiles: true }));
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingPromptAsset(false);
    }
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

      {!effectiveLlmSettings.apiKey ? (
        <div className="prompt-iteration-hint-banner warning">
          未检测到可用的 API Key。请先补全模型配置，再运行本页实验。
        </div>
      ) : null}

      {requiresPdfUpload && !supportsPdfUpload ? (
        <div className="prompt-iteration-hint-banner warning">
          当前 Prompt 快速迭代要求 PDF 直传能力。请切换到支持该能力的模型预设后再运行。
        </div>
      ) : null}

      <PromptIterationConfigPanel
        draft={draft}
        onDraftChange={setDraft}
        llmSettings={effectiveLlmSettings}
        presetName={selectedPreset?.name}
        requiresPdfUpload={requiresPdfUpload}
        supportsPdfUpload={supportsPdfUpload}
        promptAssetOptions={promptAssetOptions}
        promptVersionOptions={promptVersionOptions}
        selectedPromptAssetId={draft.promptAssetId}
        selectedPromptVersionId={draft.promptVersionId}
        onSelectPromptAsset={(assetId) => {
          const entry = (vm?.promptAssetEntries || []).find((item) => item.asset.id === assetId) || null;
          const version = entry?.latestVersion || entry?.versions?.[0] || null;
          setDraft((previous) => normalizePromptIterationDraft({
            ...previous,
            name: entry?.asset?.indicatorName || entry?.asset?.name || previous.name,
            systemPrompt: version?.systemPrompt || '',
            userPrompt: version?.userPromptTemplate || '',
            promptAssetId: entry?.asset?.id || '',
            promptVersionId: version?.id || '',
            promptIndicatorCode: entry?.asset?.indicatorCode || ''
          }, { preserveFiles: true }));
        }}
        onSelectPromptVersion={(versionId) => {
          const version = selectedPromptAssetEntry?.versions?.find((item) => item.id === versionId) || null;
          setDraft((previous) => normalizePromptIterationDraft({
            ...previous,
            systemPrompt: version?.systemPrompt || previous.systemPrompt,
            userPrompt: version?.userPromptTemplate || previous.userPrompt,
            promptVersionId: version?.id || '',
            promptIndicatorCode: selectedPromptAssetEntry?.asset?.indicatorCode || previous.promptIndicatorCode
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
