import { useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { IconCoins, IconFileZip, IconScissors } from '@tabler/icons-react';

import {
  DEFAULT_DATA_PREP_SUBTAB_KEY,
  LS_DATA_PREP_SUBTAB,
  normalizeDataPrepSubtabKey
} from '../utils/labNavigationState.js';
import { DATA_PREP_TOOLS } from '../constants/labNavigation.js';
import { TokenEstimationPage } from './TokenEstimationPage.jsx';
import { usePlatformConfig } from './PlatformConfigProvider.jsx';
import { ClosedPageOverlay } from './ClosedPageOverlay.jsx';
import { getPlatformPageDefinition } from '../constants/platformPages.js';
import { getPageKeyForDataPrepSubtab, getVisibleDataPrepSubtabs, isPlatformPageEnabled } from '../utils/platformPageVisibility.js';

const CompressorTab = lazy(() => import('./CompressorTab.jsx').then((module) => ({
  default: module.CompressorTab
})));

const PdfSplitterTab = lazy(() => import('./PdfSplitterTab.jsx').then((module) => ({
  default: module.PdfSplitterTab
})));

const TOOL_META = {
  chunking: {
    title: 'Chunking测试',
    description: '拆分文档，检查切片效果。',
    icon: <IconScissors size={20} stroke={1.8} />
  },
  'pdf-compress': {
    title: 'PDF压缩',
    description: '压缩 PDF，减小上传体积。',
    icon: <IconFileZip size={20} stroke={1.8} />
  },
  'token-estimation': {
    title: 'Token统计',
    description: '估算输入 Token 与调用成本。',
    icon: <IconCoins size={20} stroke={1.8} />
  }
};

export function DataPreprocessingWorkbench({
  globalSettings,
  modelPresets,
  globalDefaultPresetId = '',
  onOpenModelPresetManager,
  activeSubtab: externalSubtab,
  onSubtabChange
}) {
  const { config: platformConfig, configAvailable, refresh } = usePlatformConfig();
  const visibleSubtabs = useMemo(
    () => getVisibleDataPrepSubtabs(configAvailable ? platformConfig : null),
    [configAvailable, platformConfig]
  );
  const initialSubtabVisibilityAppliedRef = useRef(false);
  const [internalSubtab, setInternalSubtab] = useState(() => {
    try {
      return normalizeDataPrepSubtabKey(localStorage.getItem(LS_DATA_PREP_SUBTAB));
    } catch (_) { /* ignore */ }
    return DEFAULT_DATA_PREP_SUBTAB_KEY;
  });

  const currentSubtab = normalizeDataPrepSubtabKey(externalSubtab ?? internalSubtab);
  const currentPageKey = getPageKeyForDataPrepSubtab(currentSubtab);
  const currentPageClosed = Boolean(
    configAvailable && currentPageKey && !isPlatformPageEnabled(platformConfig, currentPageKey)
  );
  const currentPageLabel = getPlatformPageDefinition(currentPageKey)?.label || '当前子页';
  const firstAvailableSubtab = visibleSubtabs.find((tab) => tab.key !== currentSubtab) || null;

  useEffect(() => {
    try {
      localStorage.setItem(LS_DATA_PREP_SUBTAB, currentSubtab);
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

  const activeMeta = TOOL_META[currentSubtab] || TOOL_META.chunking;

  return (
    <>
    <section
      className="glass-panel main-panel"
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
          数据预处理的所有工具都已在后台关闭，不能启动新任务。
        </div>
      ) : null}

      {currentSubtab === 'chunking' && (
        <Suspense fallback={<section className="glass-panel main-panel"><p className="section-caption">正在加载 PDF 拆分器...</p></section>}>
          <PdfSplitterTab
            globalSettings={globalSettings}
            modelPresets={modelPresets}
            globalDefaultPresetId={globalDefaultPresetId}
            onOpenModelPresetManager={onOpenModelPresetManager}
          />
        </Suspense>
      )}

      {currentSubtab === 'pdf-compress' && (
        <Suspense fallback={<section className="glass-panel main-panel"><p className="section-caption">正在加载 PDF 压缩器...</p></section>}>
          <CompressorTab />
        </Suspense>
      )}

      {currentSubtab === 'token-estimation' && (
        <TokenEstimationPage
          modelPresets={modelPresets}
          globalDefaultPresetId={globalDefaultPresetId}
          onOpenModelPresetManager={onOpenModelPresetManager}
        />
      )}
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
