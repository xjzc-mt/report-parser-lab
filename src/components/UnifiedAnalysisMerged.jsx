import { forwardRef, startTransition, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Badge, Button, NumberInput, Popover, Text } from '@mantine/core';
import { IconArrowRight, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { ErrorTypeBar } from './ErrorTypeBar.jsx';
import { AnalysisDetailsTable } from './AnalysisDetailsTable.jsx';
import { buildMergedTreeData, buildPathFilters } from '../utils/unifiedAnalysisMergeAdapter.js';
import { buildAnalysisV2Index } from '../utils/analysisV2Metrics.js';
import { normalizeThresholdInput } from '../utils/analysisSettings.js';
import {
  buildHallucinationToggleConfig,
  buildPinnedSummaryConfig,
  buildAnalysisToolbarTheme,
  getRightPanelListBodyStyle,
  getNextPanelSortState,
  sortPanelChildren
} from '../utils/unifiedAnalysisPanel.js';
import { exportAnalysisPanelToExcel } from '../services/analysisPanelExportService.js';

function pct(v) {
  return v !== null && v !== undefined ? `${Math.round(v * 100)}%` : '—';
}

function metricColor(value) {
  if (value === null || value === undefined) return 'gray';
  if (value >= 0.9) return 'green';
  if (value >= 0.7) return 'yellow';
  return 'red';
}

function DotIndicator({ type }) {
  const colors = {
    '文字型': '#6366f1',
    '数值型': '#f59e0b',
    '强度型': '#ef4444'
  };
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors[type] || '#94a3b8',
        flexShrink: 0
      }}
    />
  );
}

function MetricsBadge({ value }) {
  return <Badge color={metricColor(value)} size="sm">{pct(value)}</Badge>;
}

function SimilarityBadge({ value }) {
  return <Badge color={metricColor((value || 0) / 100)} size="sm">{`${Math.round(value || 0)}%`}</Badge>;
}

function Breadcrumb({ path, onNavigate }) {
  return (
    <div
      style={{
        padding: '6px 14px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
        fontSize: 11,
        color: '#64748b',
        flexShrink: 0
      }}
    >
      {path.map((item, i) => (
        <span key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {i < path.length - 1 ? (
            <>
              <span style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => onNavigate(item.id)}>
                {item.label}
              </span>
              <span style={{ color: '#cbd5e1' }}> ›</span>
            </>
          ) : (
            <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function PinnedSummary({ node }) {
  if (!node) return null;
  const summary = buildPinnedSummaryConfig(node);
  return (
    <div
      style={{
        padding: '8px 14px',
        background: '#eff6ff',
        borderBottom: '2px solid #bfdbfe',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'nowrap',
        flexShrink: 0,
        overflowX: 'auto'
      }}
    >
      <div
        style={{
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 1
        }}
      >
        <span style={{ flexShrink: 0, fontSize: 12, lineHeight: 1 }}>📌</span>
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 700,
            fontSize: 12,
            color: '#1d4ed8'
          }}
          title={summary.title}
        >
          {summary.title}
        </span>
        <span
          style={{
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontWeight: 700,
            fontSize: 12,
            color: '#2563eb'
          }}
        >
          （{summary.subtitle}）
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', marginLeft: 'auto', flexShrink: 0 }}>
        {summary.badges.map((badge) => (
          <Badge key={badge.key} color={badge.color} size="sm" style={{ flexShrink: 0 }}>
            {badge.text}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function TableHead({ cols, children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        padding: '6px 14px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        fontWeight: 600,
        color: '#64748b',
        fontSize: 11,
        position: 'sticky',
        top: 0,
        zIndex: 1
      }}
    >
      {children}
    </div>
  );
}

function SortableHeader({ label, sortKey, sortState, onToggleSort, align = 'left' }) {
  const isActive = sortState?.key === sortKey;
  const indicator = !isActive ? '↕' : sortState.direction === 'asc' ? '↑' : '↓';
  return (
    <button
      type="button"
      onClick={() => onToggleSort(sortKey)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        gap: 4,
        width: '100%',
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: isActive ? '#1d4ed8' : '#64748b',
        fontSize: 11,
        fontWeight: isActive ? 700 : 600,
        cursor: 'pointer'
      }}
    >
      <span>{label}</span>
      <span style={{ opacity: isActive ? 1 : 0.55 }}>{indicator}</span>
    </button>
  );
}

function EmptyHeadSpacer() {
  return <span style={{ width: 0, minWidth: 0 }} />;
}

function TableRow({ cols, onClick, children, clickable = false }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        padding: '7px 14px',
        borderBottom: '1px solid #f1f5f9',
        alignItems: 'center',
        cursor: clickable ? 'pointer' : 'default',
        fontSize: 11.5
      }}
      onClick={onClick}
      onMouseEnter={(e) => clickable && (e.currentTarget.style.background = '#f8fafc')}
      onMouseLeave={(e) => clickable && (e.currentTarget.style.background = '')}
    >
      {children}
    </div>
  );
}

const COLS = {
  typeList: '24px 1fr repeat(9, 72px)',
  indicatorList: '1fr repeat(9, 72px)',
  reportList: '1fr repeat(9, 72px)'
};

function renderMetricsCells(metrics) {
  return (
    <>
      <span style={{ color: '#64748b', textAlign: 'center', justifySelf: 'center' }}>{metrics.testItemCount}</span>
      <span style={{ justifySelf: 'center' }}><MetricsBadge value={metrics.strictPassRate} /></span>
      <span style={{ justifySelf: 'center' }}><MetricsBadge value={metrics.lenientPassRate} /></span>
      <span style={{ justifySelf: 'center' }}><MetricsBadge value={metrics.recall} /></span>
      <span style={{ justifySelf: 'center' }}><MetricsBadge value={metrics.precision} /></span>
      <span style={{ justifySelf: 'center' }}><MetricsBadge value={metrics.duplicateRate} /></span>
      <span style={{ justifySelf: 'center' }}><MetricsBadge value={metrics.missRate} /></span>
      <span style={{ justifySelf: 'center' }}><SimilarityBadge value={metrics.averageBestSimilarity} /></span>
      <span style={{ justifySelf: 'center' }}><MetricsBadge value={metrics.hallucinationRate} /></span>
    </>
  );
}

function RightPanel({ selectedNode, panelNode, onSelectNode, sortState, onToggleSort, treeContentHeight, maxViewportHeight }) {
  if (!panelNode) {
    return <div style={{ padding: 20, color: '#64748b', fontSize: 12 }}>请在左侧树中选择一个节点查看详情</div>;
  }

  const { section, level } = panelNode;

  const renderList = (children, type = 'report') => {
    const sortedChildren = sortPanelChildren(children, sortState, type);
    const cols = type === 'type' ? COLS.typeList : type === 'indicator' ? COLS.indicatorList : COLS.reportList;
    const bodyStyle = getRightPanelListBodyStyle({ type, childCount: children.length, treeBodyHeight: treeContentHeight, maxViewportHeight });
    return (
      <div>
        <TableHead cols={cols}>
          {type === 'type' ? <EmptyHeadSpacer /> : null}
          <SortableHeader
            label={type === 'type' ? '指标类型' : type === 'indicator' ? '指标' : '报告'}
            sortKey="label"
            sortState={sortState}
            onToggleSort={onToggleSort}
          />
          <SortableHeader label="测试项" sortKey="testItemCount" sortState={sortState} onToggleSort={onToggleSort} align="center" />
          <SortableHeader label="严格通过" sortKey="strictPassRate" sortState={sortState} onToggleSort={onToggleSort} align="center" />
          <SortableHeader label="宽松通过" sortKey="lenientPassRate" sortState={sortState} onToggleSort={onToggleSort} align="center" />
          <SortableHeader label="召回率" sortKey="recall" sortState={sortState} onToggleSort={onToggleSort} align="center" />
          <SortableHeader label="精确率" sortKey="precision" sortState={sortState} onToggleSort={onToggleSort} align="center" />
          <SortableHeader label="重复率" sortKey="duplicateRate" sortState={sortState} onToggleSort={onToggleSort} align="center" />
          <SortableHeader label="漏摘率" sortKey="missRate" sortState={sortState} onToggleSort={onToggleSort} align="center" />
          <SortableHeader label="相似度" sortKey="averageBestSimilarity" sortState={sortState} onToggleSort={onToggleSort} align="center" />
          <SortableHeader label="幻觉率" sortKey="hallucinationRate" sortState={sortState} onToggleSort={onToggleSort} align="center" />
        </TableHead>
        <div style={bodyStyle}>
          {sortedChildren.map((child) => (
            <TableRow key={child.id} cols={cols} onClick={() => onSelectNode(child)} clickable>
              {type === 'type' ? <DotIndicator type={child.label} /> : null}
              <span style={{ fontWeight: 600, color: '#1e40af' }}>{child.label} ›</span>
              {renderMetricsCells(child.metrics)}
            </TableRow>
          ))}
        </div>
      </div>
    );
  };

  if (section === 'cross-report' && level === 'root') return renderList(panelNode.children, 'type');
  if (section === 'cross-report' && level === 'valueType') return renderList(panelNode.children, 'indicator');
  if (section === 'per-report' && level === 'root') return renderList(panelNode.children, 'report');
  if (section === 'per-report' && level === 'report') return renderList(panelNode.children, 'type');
  if (section === 'per-report' && level === 'reportType') return renderList(panelNode.children, 'indicator');
  if (section === 'per-type' && level === 'type') return renderList(panelNode.children, 'report');
  if (section === 'per-type' && level === 'typeReport') return renderList(panelNode.children, 'indicator');

  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>当前节点概览</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>测试项 {panelNode.metrics.testItemCount}</div>
        <div style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>严格通过 {pct(panelNode.metrics.strictPassRate)}</div>
        <div style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>宽松通过 {pct(panelNode.metrics.lenientPassRate)}</div>
        <div style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>召回率 {pct(panelNode.metrics.recall)}</div>
      </div>
      <Text size="sm" c="dimmed">
        当前节点已在下方同步展示全部明细，并自动带入路径筛选条件。
      </Text>
    </div>
  );
}

function TreeItem({ node, depth = 0, selectedId, onSelect, expandedIds, onToggle }) {
  const isSelected = selectedId === node.id;
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const allowSidebarExpand = hasChildren && !['valueType', 'reportType', 'typeReport'].includes(node.level);
  const indent = depth * 14;
  const bgColor = isSelected ? '#dbeafe' : 'transparent';
  const borderColor = isSelected ? '#2563eb' : 'transparent';
  const labelColor = isSelected ? '#1d4ed8' : '#374151';
  const VT_COLORS = { '文字型': '#6366f1', '数值型': '#f59e0b', '强度型': '#ef4444' };
  const vtColor = VT_COLORS[node.label];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: `5px 10px 5px ${10 + indent}px`,
          cursor: 'pointer',
          userSelect: 'none',
          background: bgColor,
          borderLeft: `3px solid ${borderColor}`
        }}
        onClick={() => onSelect(node)}
        onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = '#eff6ff')}
        onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = bgColor)}
      >
        <span
          style={{ width: 12, flexShrink: 0, color: '#64748b', fontSize: 10 }}
          onClick={(e) => {
            if (allowSidebarExpand) {
              e.stopPropagation();
              onToggle(node.id);
            }
          }}
        >
          {allowSidebarExpand ? (
            isExpanded ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />
          ) : null}
        </span>
        {node.level === 'root' && <span style={{ fontSize: 13 }}>🌐</span>}
        {node.level === 'report' && <span style={{ fontSize: 13 }}>📄</span>}
        {(node.level === 'valueType' || node.level === 'reportType' || node.level === 'type') && vtColor && (
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: vtColor, flexShrink: 0 }} />
        )}
        <span
          style={{
            flex: 1,
            color: labelColor,
            fontWeight: isSelected || node.level === 'root' ? 600 : 400,
            fontSize: 11.5,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {node.label}
        </span>
        <span
          style={{
            fontSize: 10,
            background: isSelected ? '#bfdbfe' : '#e2e8f0',
            borderRadius: 8,
            padding: '1px 6px',
            color: isSelected ? '#1d4ed8' : '#64748b',
            flexShrink: 0
          }}
        >
          {node.metrics.testItemCount}
        </span>
      </div>

      {allowSidebarExpand && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}


export const UnifiedAnalysisMerged = forwardRef(function UnifiedAnalysisMerged({
  comparisonRows = [],
  threshold = 70,
  onThresholdChange,
  includeHallucination = true,
  onIncludeHallucinationChange,
  onJumpToOptimization
}, ref) {
  const [selectedId, setSelectedId] = useState('cross_root');
  const [expandedIds, setExpandedIds] = useState(new Set(['cross_root', 'per_report_root']));
  const [inputValue, setInputValue] = useState(threshold);
  const [selectedYears, setSelectedYears] = useState([]);
  const [yearPopoverOpen, setYearPopoverOpen] = useState(false);
  const [tempSelectedYears, setTempSelectedYears] = useState([]);
  const [sortState, setSortState] = useState(null);
  const detailsRef = useRef(null);
  const panelShellRef = useRef(null);
  const treeContentRef = useRef(null);
  const [treeContentHeight, setTreeContentHeight] = useState(0);
  const [maxViewportHeight, setMaxViewportHeight] = useState(Number.POSITIVE_INFINITY);

  useEffect(() => {
    setInputValue(threshold);
  }, [threshold]);

  const analysisIndex = useMemo(() => buildAnalysisV2Index(comparisonRows), [comparisonRows]);
  const allYears = analysisIndex.allYears;

  useEffect(() => {
    if (allYears.length > 0 && selectedYears.length === 0) {
      setSelectedYears(allYears);
    }
  }, [allYears, selectedYears.length]);

  const treeData = useMemo(
    () => buildMergedTreeData(analysisIndex, threshold, includeHallucination, selectedYears),
    [analysisIndex, threshold, includeHallucination, selectedYears]
  );

  const selectedNode = useMemo(() => treeData.nodeMap.get(selectedId) || null, [treeData, selectedId]);

  const breadcrumbPath = useMemo(() => {
    return (treeData.pathMap.get(selectedId) || []).map((node) => ({ id: node.id, label: node.label }));
  }, [treeData, selectedId]);

  const selectedNodePathObjects = useMemo(() => treeData.pathMap.get(selectedId) || [], [treeData, selectedId]);

  const panelNode = useMemo(() => {
    if (!selectedNode) return null;
    if (selectedNode.level !== 'indicator') return selectedNode;
    return selectedNodePathObjects[selectedNodePathObjects.length - 2] || selectedNode;
  }, [selectedNode, selectedNodePathObjects]);

  useEffect(() => {
    setSortState(null);
  }, [panelNode?.id]);

  const detailBaseFilters = useMemo(() => buildPathFilters(selectedNodePathObjects), [selectedNodePathObjects]);

  const jumpableCodes = useMemo(() => {
    if (!selectedNode) return [];
    return Array.from(new Set(
      selectedNode.items
        .filter((item) => !item.lenientPass)
        .map((item) => item.indicatorCode)
        .filter(Boolean)
    ));
  }, [selectedNode]);

  const hallucinationToggle = useMemo(
    () => buildHallucinationToggleConfig(includeHallucination),
    [includeHallucination]
  );
  const toolbarTheme = useMemo(() => buildAnalysisToolbarTheme(), []);

  useImperativeHandle(ref, () => ({
    exportPanelData: () => {
      if (!panelNode) return Promise.resolve(false);
      return exportAnalysisPanelToExcel(panelNode).then(() => true);
    }
  }), [panelNode]);

  const handleSelect = useCallback((node) => {
    setSelectedId(node.id);
    setExpandedIds((prev) => new Set([...prev, node.id]));
  }, []);

  const handleToggle = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (selectedNode?.level === 'indicator') {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedNode]);

  const handleToggleSort = useCallback((sortKey) => {
    setSortState((current) => getNextPanelSortState(current, sortKey));
  }, []);

  useEffect(() => {
    const node = treeContentRef.current;
    if (!node) return undefined;

    const updateHeight = () => setTreeContentHeight(Math.ceil(node.getBoundingClientRect().height || 0));
    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    const node = panelShellRef.current;
    if (!node) return undefined;

    const updateViewportHeight = () => {
      const rect = node.getBoundingClientRect();
      const nextHeight = Math.max(320, Math.floor(window.innerHeight - rect.top - 24));
      setMaxViewportHeight(nextHeight);
    };

    updateViewportHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateViewportHeight);
      observer.observe(node);
      window.addEventListener('resize', updateViewportHeight);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', updateViewportHeight);
      };
    }

    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  if (!comparisonRows.length) {
    return (
      <div style={{ padding: 24, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
        暂无分析数据，请先上传文件并运行关联分析
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          border: `1px solid ${toolbarTheme.cardBorder}`,
          borderRadius: 18,
          overflow: 'hidden',
          background: toolbarTheme.cardBackground,
          boxShadow: toolbarTheme.cardShadow,
          marginBottom: 14
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: toolbarTheme.toolbarPadding,
            background: toolbarTheme.toolbarBackground,
            borderBottom: panelNode ? `1px solid ${toolbarTheme.toolbarBorder}` : 'none'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              flex: '0 1 auto',
              minWidth: 0,
              maxWidth: 'calc(100% - 220px)'
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                minHeight: toolbarTheme.controlHeight,
                padding: '3px 9px 3px 11px',
                border: `1px solid ${toolbarTheme.controlBorder}`,
                borderRadius: 12,
                background: toolbarTheme.controlBackground,
                boxShadow: toolbarTheme.controlShadow
              }}
            >
              <Text size="sm" fw={800} c={toolbarTheme.controlText} style={{ fontSize: 13 }}>
                相似度阈值
              </Text>
              <NumberInput
                value={inputValue}
                onChange={(val) => setInputValue(val === undefined ? '' : val)}
                onBlur={() => onThresholdChange?.(normalizeThresholdInput(inputValue))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onThresholdChange?.(normalizeThresholdInput(inputValue));
                    e.currentTarget.blur();
                  }
                }}
                min={0}
                max={100}
                step={5}
                hideControls
                style={{ width: toolbarTheme.thresholdInputWidth }}
                styles={{
                  input: {
                    height: 26,
                    minHeight: 26,
                    padding: '0 6px',
                    border: '1px solid #d3dce8',
                    borderRadius: 8,
                    background: '#edf1f7',
                    color: '#0f172a',
                    textAlign: 'center',
                    fontSize: 12.5,
                    fontWeight: 800
                  }
                }}
                size="sm"
              />
            </div>

            <Popover opened={yearPopoverOpen} onChange={setYearPopoverOpen} position="bottom-start" width={200}>
              <Popover.Target>
                <Button
                  size="sm"
                  variant="default"
                  radius="md"
                  styles={{
                    root: {
                      minHeight: toolbarTheme.controlHeight,
                      paddingInline: 14,
                      background: toolbarTheme.controlBackground,
                      borderColor: toolbarTheme.controlBorder,
                      color: toolbarTheme.controlText,
                      boxShadow: toolbarTheme.controlShadow
                    },
                    label: {
                      color: toolbarTheme.controlText,
                      fontWeight: 800
                    }
                  }}
                  onClick={() => {
                    setTempSelectedYears(selectedYears);
                    setYearPopoverOpen(true);
                  }}
                >
                  选择年份
                </Button>
              </Popover.Target>
              <Popover.Dropdown style={{ background: '#fff', border: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allYears.map((year) => (
                    <label
                      key={year}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={tempSelectedYears.includes(year)}
                        onChange={(e) => {
                          if (e.currentTarget.checked) setTempSelectedYears([...tempSelectedYears, year]);
                          else setTempSelectedYears(tempSelectedYears.filter((y) => y !== year));
                        }}
                      />
                      <span>{year}</span>
                    </label>
                  ))}
                  <Button
                    size="xs"
                    onClick={() => {
                      startTransition(() => setSelectedYears(tempSelectedYears));
                      setYearPopoverOpen(false);
                    }}
                    disabled={tempSelectedYears.length === 0}
                  >
                    应用
                  </Button>
                </div>
              </Popover.Dropdown>
            </Popover>

            <label
              style={{
                minHeight: toolbarTheme.controlHeight,
                padding: '0 12px',
                border: `1px solid ${toolbarTheme.controlBorder}`,
                borderRadius: 12,
                background: toolbarTheme.controlBackground,
                boxShadow: toolbarTheme.controlShadow,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8
              }}
          >
            <input
              type="checkbox"
              checked={hallucinationToggle.checked}
              onChange={(e) => startTransition(() => onIncludeHallucinationChange?.(e.currentTarget.checked))}
              style={{
                width: 15,
                height: 15,
                accentColor: '#2563eb',
                cursor: 'pointer'
              }}
            />
            <span style={{ color: toolbarTheme.controlText, fontSize: 13, fontWeight: 800 }}>
              {hallucinationToggle.label}
            </span>
          </label>
          </div>

          {onJumpToOptimization && (
            <Button
              size="sm"
              radius="md"
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan' }}
              rightSection={<IconArrowRight size={14} />}
              onClick={() => onJumpToOptimization(comparisonRows, jumpableCodes)}
              disabled={jumpableCodes.length === 0}
              style={{
                marginLeft: 'auto',
                minHeight: toolbarTheme.actionHeight,
                boxShadow: toolbarTheme.actionShadow
              }}
              styles={{
                root: {
                  minHeight: toolbarTheme.actionHeight,
                  paddingInline: 16,
                  borderRadius: 12,
                  backgroundImage: toolbarTheme.actionBackground
                },
                label: {
                  fontSize: 13.5,
                  fontWeight: 800
                }
              }}
            >
              选择优化指标
            </Button>
          )}
        </div>

        {panelNode && (
          <div
            style={{
              padding: toolbarTheme.structurePadding,
              background: toolbarTheme.structureBackground
            }}
          >
            <Text size="sm" fw={900} c="#475569" mb={10}>
              结构分布 — <span style={{ color: '#1d4ed8', fontWeight: 900 }}>{panelNode.label}</span>
            </Text>
            <ErrorTypeBar breakdown={panelNode.metrics.categoryBreakdown} />
          </div>
        )}
      </div>

      <div
        ref={panelShellRef}
        style={{
          display: 'flex',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#fff',
          minHeight: 440
        }}
      >
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid #e2e8f0',
            background: '#f8fafc',
            overflowY: 'auto'
          }}
        >
          <div ref={treeContentRef}>
            <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              按指标视角
            </div>
            <TreeItem node={treeData.crossReportRoot} depth={0} selectedId={selectedId} onSelect={handleSelect} expandedIds={expandedIds} onToggle={handleToggle} />

            <div style={{ height: 1, background: '#e2e8f0', margin: '6px 0' }} />

            <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              按报告视角
            </div>
            <TreeItem node={treeData.perReportRoot} depth={0} selectedId={selectedId} onSelect={handleSelect} expandedIds={expandedIds} onToggle={handleToggle} />

            {treeData.perTypeRoot.children.map((typeNode) => (
              <TreeItem
                key={typeNode.id}
                node={typeNode}
                depth={0}
                selectedId={selectedId}
                onSelect={handleSelect}
                expandedIds={expandedIds}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <Breadcrumb path={breadcrumbPath} onNavigate={setSelectedId} />
          <PinnedSummary node={panelNode} />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <RightPanel
              selectedNode={selectedNode}
              panelNode={panelNode}
              onSelectNode={handleSelect}
              sortState={sortState}
              onToggleSort={handleToggleSort}
              treeContentHeight={treeContentHeight}
              maxViewportHeight={maxViewportHeight}
            />
          </div>
        </div>
      </div>

      {selectedNode && (
        <div style={{ marginTop: 12 }} ref={detailsRef}>
          <AnalysisDetailsTable
            items={selectedNode.items}
            hallucinations={selectedNode.hallucinations}
            threshold={threshold}
            baseFilters={detailBaseFilters}
            title={`${selectedNode.label} / 全部明细`}
            bodyMaxHeight="calc(100vh - 135px)"
          />
        </div>
      )}
    </div>
  );
});
