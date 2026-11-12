import { useEffect, useMemo, useRef, useState } from 'react';
import { IconChecklist, IconFlask, IconSparkles } from '@tabler/icons-react';
import { FullFlowMode } from './FullFlowMode.jsx';
import { QuickValidationMode } from './QuickValidationMode.jsx';
import { QuickOptimizationMode } from './QuickOptimizationMode.jsx';
import { PromptAssetLibraryDrawer } from './promptAssets/PromptAssetLibraryDrawer.jsx';
import { DEFAULT_SETTINGS } from '../constants/extraction.js';
import { DEFAULT_LLM2_SETTINGS } from '../constants/testBench.js';
import {
  DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY,
  LS_TEST_SET_WORKBENCH_SUBTAB,
  normalizeTestSetWorkbenchSubtabKey
} from '../utils/testSetWorkbenchSettings.js';
import { createComparisonRowsWorkbookFile } from '../services/testBenchService.js';
import {
  backfillPromptAssetSystemPrompts,
  backfillPromptAssetValueTypes,
  importPromptAssetFile,
  listPromptAssetLibraryEntries
} from '../services/promptAssetLibraryService.js';
import { usePlatformConfig } from './PlatformConfigProvider.jsx';
import { ClosedPageOverlay } from './ClosedPageOverlay.jsx';
import { getPlatformPageDefinition } from '../constants/platformPages.js';
import { getPageKeyForTestSetSubtab, getVisibleTestSetSubtabs, isPlatformPageEnabled } from '../utils/platformPageVisibility.js';
import { confirmNavigationIfRunning, hasRunningTasks } from '../utils/runningTaskGuard.js';

const SUBPAGE_META = {
  'prompt-iteration': {
    title: 'Prompt快速迭代',
    description: '在测试集文件上批量试跑 Prompt，快速观察提取效果与稳定性。',
    icon: <IconFlask size={20} stroke={1.8} />
  },
  'model-validation': {
    title: '模型结果验收',
    description: '对比模型预测结果与人工标注真值，多维分析准确率与误差分布。',
    icon: <IconChecklist size={20} stroke={1.8} />
  },
  'prompt-optimization': {
    title: 'Prompt自动优化',
    description: '基于测试集验收中的错误样本，自动化诊断并迭代优化 Prompt。',
    icon: <IconSparkles size={20} stroke={1.8} />
  }
};

export function TestSetWorkbench({
  globalSettings = DEFAULT_SETTINGS,
  modelPresets = [],
  globalDefaultPresetId = '',
  onOpenModelPresetManager,
  promptAssetLibraryOpened = false,
  onPromptAssetLibraryClose,
  onOpenPromptAssetLibrary,
  activeSubtab: externalSubtab,
  onSubtabChange
}) {
  const { config: platformConfig, configAvailable, refresh } = usePlatformConfig();
  const visibleSubtabs = useMemo(
    () => getVisibleTestSetSubtabs(configAvailable ? platformConfig : null),
    [configAvailable, platformConfig]
  );
  const initialSubtabVisibilityAppliedRef = useRef(false);
  const [internalSubtab, setInternalSubtab] = useState(() => {
    try {
      return normalizeTestSetWorkbenchSubtabKey(localStorage.getItem(LS_TEST_SET_WORKBENCH_SUBTAB));
    } catch (_) { /* ignore */ }
    return DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY;
  });
  const [promptAssetEntries, setPromptAssetEntries] = useState([]);
  const [promptAssetImporting, setPromptAssetImporting] = useState(false);
  const [promptAssetImportSummary, setPromptAssetImportSummary] = useState(null);
  const [promptIterationSeed, setPromptIterationSeed] = useState(null);
  const [incomingOptimizationContext, setIncomingOptimizationContext] = useState(null);

  const currentSubtab = normalizeTestSetWorkbenchSubtabKey(externalSubtab ?? internalSubtab);
  const currentPageKey = getPageKeyForTestSetSubtab(currentSubtab);
  const currentPageClosed = Boolean(
    currentPageKey && !isPlatformPageEnabled(configAvailable ? platformConfig : null, currentPageKey)
  );
  const currentPageLabel = getPlatformPageDefinition(currentPageKey)?.label || '当前功能';
  const firstAvailableSubtab = visibleSubtabs.find((tab) => tab.key !== currentSubtab) || null;
  const llm2Settings = DEFAULT_LLM2_SETTINGS;

  const reloadPromptAssets = async () => {
    try {
      await backfillPromptAssetValueTypes();
      await backfillPromptAssetSystemPrompts();
      setPromptAssetEntries(await listPromptAssetLibraryEntries());
    } catch (_) { /* ignore */ }
  };

  useEffect(() => {
    void reloadPromptAssets();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TEST_SET_WORKBENCH_SUBTAB, currentSubtab);
    } catch (_) { /* ignore */ }
  }, [currentSubtab]);

  useEffect(() => {
    if (!configAvailable || initialSubtabVisibilityAppliedRef.current) {
      return;
    }
    initialSubtabVisibilityAppliedRef.current = true;
    if (visibleSubtabs.length === 0) {
      return;
    }
    if (!visibleSubtabs.some((tab) => tab.key === currentSubtab)) {
      const nextKey = visibleSubtabs[0].key;
      if (onSubtabChange) {
        onSubtabChange(nextKey);
      } else {
        setInternalSubtab(nextKey);
      }
    }
  }, [configAvailable, currentSubtab, visibleSubtabs, onSubtabChange]);

  const handleImportPromptAssets = async (file) => {
    if (!file) {
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      window.alert('请上传 Excel 或 CSV 文件');
      return;
    }

    setPromptAssetImporting(true);
    try {
      const summary = await importPromptAssetFile(file);
      setPromptAssetImportSummary(summary);
      await reloadPromptAssets();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setPromptAssetImporting(false);
    }
  };

  const handleSwitchToOptimization = async (rows, selectedCodes = []) => {
    const activePageKey = getPageKeyForTestSetSubtab(currentSubtab);
    if (activePageKey && hasRunningTasks(activePageKey)
      && !confirmNavigationIfRunning(activePageKey)) {
      return;
    }
    let comparisonWorkbookFile = null;
    try {
      comparisonWorkbookFile = await createComparisonRowsWorkbookFile(rows, {
        fileName: 'validation_to_optimization.xlsx'
      });
    } catch (_) { /* ignore */ }

    setIncomingOptimizationContext({
      id: `${Date.now()}_${Math.random()}`,
      comparisonRows: rows,
      comparisonFile: comparisonWorkbookFile,
      selectedCodes
    });

    if (onSubtabChange) {
      onSubtabChange('prompt-optimization');
    } else {
      setInternalSubtab('prompt-optimization');
    }
  };

  const promptIterationVm = {
    promptAssetEntries,
    onPromptAssetsChanged: reloadPromptAssets,
    onOpenPromptAssetLibrary,
    incomingPromptIterationSeed: promptIterationSeed,
    onConsumePromptIterationSeed: () => setPromptIterationSeed(null),
    onOpenSettings: onOpenModelPresetManager
  };

  const activeMeta = SUBPAGE_META[currentSubtab] || SUBPAGE_META['prompt-iteration'];

  return (
    <>
    <section
      className="glass-panel main-panel testbench-panel"
      inert={currentPageClosed ? true : undefined}
    >
      <div className="section-heading workspace-heading">
        <div className="workspace-heading-shell">
          <div className="workspace-heading-copy">
            <h2 className="section-title">
              {activeMeta.icon}
              <span>{activeMeta.title}</span>
            </h2>
            <p className="section-caption">{activeMeta.description}</p>
          </div>
        </div>
      </div>

      {visibleSubtabs.length === 0 ? (
        <div className="platform-config-banner warning">
          该模块的所有子页面都已在后台关闭，不能启动新任务。
        </div>
      ) : null}

      {/* 快速迭代运行期间不能被内部切页卸载；只在测试集工作台真正卸载时清理。 */}
      <div style={{ display: currentSubtab === 'prompt-iteration' ? 'block' : 'none' }}>
        <FullFlowMode
          modelPresets={modelPresets}
          globalDefaultPresetId={globalDefaultPresetId}
          vm={promptIterationVm}
        />
      </div>

      {currentSubtab === 'model-validation' && (
        <QuickValidationMode
          globalSettings={globalSettings}
          llm2Settings={llm2Settings}
          onSwitchToOptimization={handleSwitchToOptimization}
        />
      )}

      {currentSubtab === 'prompt-optimization' && (
        <QuickOptimizationMode
          llm2Settings={llm2Settings}
          modelPresets={modelPresets}
          globalDefaultPresetId={globalDefaultPresetId}
          onOpenModelPresetManager={onOpenModelPresetManager}
          promptAssetEntries={promptAssetEntries}
          onOpenPromptAssetLibrary={onOpenPromptAssetLibrary}
          onPromptAssetsChanged={reloadPromptAssets}
          incomingContext={incomingOptimizationContext}
          onConsumeIncomingContext={() => setIncomingOptimizationContext(null)}
          onSendToPromptIteration={(seed) => {
            setPromptIterationSeed(seed);
            if (onSubtabChange) {
              onSubtabChange('prompt-iteration');
            } else {
              setInternalSubtab('prompt-iteration');
            }
          }}
        />
      )}

      <PromptAssetLibraryDrawer
        opened={promptAssetLibraryOpened}
        onClose={() => onPromptAssetLibraryClose?.()}
        entries={promptAssetEntries}
        isImporting={promptAssetImporting}
        importSummary={promptAssetImportSummary}
        onImportFile={handleImportPromptAssets}
        onRefresh={reloadPromptAssets}
      />
    </section>
    {currentPageClosed ? (
      <ClosedPageOverlay
        pageLabel={currentPageLabel}
        onRefresh={refresh}
        onGoToAvailable={firstAvailableSubtab
          ? () => {
              if (onSubtabChange) {
                onSubtabChange(firstAvailableSubtab.key);
              } else {
                setInternalSubtab(firstAvailableSubtab.key);
              }
            }
          : undefined}
      />
    ) : null}
    </>
  );
}
