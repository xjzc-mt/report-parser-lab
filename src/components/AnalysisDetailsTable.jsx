import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button, Checkbox, Popover, RangeSlider, Tooltip } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import {
  applyDetailFilters,
  buildVirtualLayout,
  buildDetailColumnOptions,
  buildDetailRowModels,
  CATEGORY_META,
  EMPTY_DETAIL_FILTERS,
  getDetailRowHeight,
  getNextDetailSortState,
  sortDetailRows,
  getVirtualWindow,
  resolveDetailFields
} from '../utils/analysisDetailsModel.js';

const GRID_TEMPLATE = '140px 180px 90px 96px 116px minmax(311px, 1fr) minmax(311px, 1fr) 64px';

function similarityColor(value, threshold = 70) {
  if (value >= Math.max(90, threshold + 15)) return '#166534';
  if (value >= threshold) return '#15803d';
  if (value >= Math.max(50, threshold - 15)) return '#b45309';
  return '#b91c1c';
}

function clampTextStyle(lines = 2) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.45
  };
}

function highlightSharedText(source, target) {
  const text = String(source || '').trim() || '—';
  const other = new Set(String(target || '').trim().split(''));
  return text.split('').map((char, index) => (
    <span key={`${char}-${index}`} style={other.has(char) && char.trim() ? { color: '#166534', fontWeight: 700 } : undefined}>
      {char}
    </span>
  ));
}

function OverflowTooltip({ label, lines = 2, width = 360, textStyle = {}, forceTooltip = false, children }) {
  const ref = useRef(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const checkOverflow = () => {
      const nextOverflow = node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
      setOverflowing(nextOverflow);
    };

    checkOverflow();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(checkOverflow);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [label, lines]);

  const content = (
    <div ref={ref} style={{ ...clampTextStyle(lines), ...textStyle }}>
      {children}
    </div>
  );

  if (!overflowing && !forceTooltip) return content;

  return (
    <Tooltip label={label || '—'} multiline withArrow width={width}>
      {content}
    </Tooltip>
  );
}

function DetailBlock({ title, fields }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {fields.map((field) => (
          <div key={`${title}-${field.label}`} style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 6, fontSize: 11, minWidth: 0 }}>
            <span style={{ color: '#475569', whiteSpace: 'nowrap' }}>{field.label}</span>
            <OverflowTooltip
              label={field.value || '—'}
              lines={field.maxLines || 2}
              width={420}
              textStyle={{ color: '#0f172a', minWidth: 0 }}
              forceTooltip={field.alwaysTooltip}
            >
              {field.highlight ? highlightSharedText(field.value, field.compareValue) : (field.value || '—')}
            </OverflowTooltip>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortLabelButton({ label, sortKey, sortState, onToggleSort }) {
  const isActive = sortState?.key === sortKey;
  const indicator = !isActive ? '↕' : sortState.direction === 'asc' ? '↑' : '↓';

  return (
    <button
      type="button"
      onClick={() => onToggleSort(sortKey)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        flex: 1,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: isActive ? '#1d4ed8' : '#334155',
        fontSize: 11,
        lineHeight: 1.2,
        fontWeight: isActive ? 700 : 600,
        cursor: 'pointer'
      }}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ opacity: isActive ? 1 : 0.55, flexShrink: 0 }}>{indicator}</span>
    </button>
  );
}

function ColumnFilterHeader({ label, options = [], value = [], onApply, sortKey = null, sortState = null, onToggleSort = null }) {
  const [opened, setOpened] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    if (!opened) setTempValue(value);
  }, [value, opened]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%', minWidth: 0, minHeight: 20 }}>
      {sortKey && onToggleSort ? (
        <SortLabelButton label={label} sortKey={sortKey} sortState={sortState} onToggleSort={onToggleSort} />
      ) : (
        <span
          style={{
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: 11,
            lineHeight: 1.2,
            fontWeight: 600
          }}
        >
          {label}
        </span>
      )}
      <Popover opened={opened} onChange={setOpened} position="bottom-end" width={240}>
        <Popover.Target>
          <ActionIcon
            size="xs"
            variant={value.length > 0 ? 'filled' : 'subtle'}
            color={value.length > 0 ? 'blue' : 'gray'}
            style={{ marginLeft: 'auto', flexShrink: 0 }}
            onClick={() => setOpened((prev) => !prev)}
          >
            <IconFilter size={11} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 320 }}>
            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {options.map((option) => (
                  <Checkbox
                    key={option}
                    label={option}
                    checked={tempValue.includes(option)}
                    onChange={(event) => {
                      if (event.currentTarget.checked) setTempValue((prev) => [...prev, option]);
                      else setTempValue((prev) => prev.filter((item) => item !== option));
                    }}
                  />
                ))}
                {options.length === 0 ? <div style={{ color: '#64748b', fontSize: 12 }}>暂无可筛选项</div> : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', padding: 12, borderTop: '1px solid #e2e8f0', background: '#fff', position: 'sticky', bottom: 0 }}>
              <Button size="xs" variant="default" onClick={() => setTempValue([])}>清空</Button>
              <Button
                size="xs"
                onClick={() => {
                  onApply(tempValue);
                  setOpened(false);
                }}
              >
                应用
              </Button>
            </div>
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}

function SimilarityRangeHeader({ value = [0, 100], onApply, sortState, onToggleSort }) {
  const [opened, setOpened] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const isActive = value[0] !== 0 || value[1] !== 100;

  useEffect(() => {
    if (!opened) setTempValue(value);
  }, [value, opened]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%', minWidth: 0, minHeight: 20 }}>
      <SortLabelButton label="相似度" sortKey="bestSimilarity" sortState={sortState} onToggleSort={onToggleSort} />
      <Popover opened={opened} onChange={setOpened} position="bottom-end" width={236}>
        <Popover.Target>
          <ActionIcon
            size="xs"
            variant={isActive ? 'filled' : 'subtle'}
            color={isActive ? 'blue' : 'gray'}
            style={{ marginLeft: 'auto', flexShrink: 0 }}
            onClick={() => setOpened((prev) => !prev)}
          >
            <IconFilter size={11} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#475569' }}>
              <span>{tempValue[0]}%</span>
              <span>{tempValue[1]}%</span>
            </div>
            <RangeSlider
              min={0}
              max={100}
              step={1}
              minRange={0}
              value={tempValue}
              onChange={setTempValue}
              labelAlwaysOn
              label={(val) => `${val}%`}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <Button size="xs" variant="default" onClick={() => setTempValue([0, 100])}>清空</Button>
              <Button
                size="xs"
                onClick={() => {
                  onApply(tempValue);
                  setOpened(false);
                }}
              >
                应用
              </Button>
            </div>
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}

function HeaderCell({ align = 'left', children }) {
  return (
    <div
      style={{
        textAlign: align,
        padding: '6px 10px',
        overflow: 'hidden',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        minHeight: 38
      }}
    >
      {children}
    </div>
  );
}

function StaticHeaderLabel({ label }) {
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontSize: 11,
        lineHeight: 1.2,
        fontWeight: 600
      }}
    >
      {label}
    </span>
  );
}

function DetailRow({ row, threshold, top }) {
  const categoryMeta = CATEGORY_META[row.categoryKey] || CATEGORY_META.single_fail;
  const detailFields = resolveDetailFields(row);
  const rowHeight = getDetailRowHeight(row);

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: rowHeight,
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        borderTop: '1px solid #e2e8f0',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <div style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 600, fontSize: 11.5, display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <OverflowTooltip label={row.reportName || '—'} lines={4} width={320}>
          {row.reportName || '—'}
        </OverflowTooltip>
      </div>
      <div style={{ padding: '10px 12px', color: '#0f172a', display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <OverflowTooltip label={row.indicatorLabel || '—'} lines={3} width={360} textStyle={{ minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', ...clampTextStyle(1) }}>
              {row.indicatorCode || '—'}
            </div>
            <div style={{ fontSize: 11, color: '#334155', marginTop: 2, ...clampTextStyle(2) }}>
              {row.indicatorName || '—'}
            </div>
          </div>
        </OverflowTooltip>
      </div>
      <div style={{ padding: '10px 12px', color: '#0f172a', display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <OverflowTooltip label={row.rawValueType || row.valueType || '—'} lines={2} width={220} textStyle={{ fontSize: 11, color: '#334155' }}>
          {row.rawValueType || row.valueType || '—'}
        </OverflowTooltip>
      </div>
      <div style={{ padding: '10px 12px', color: similarityColor(row.bestSimilarity, threshold), fontWeight: 800, fontSize: 11, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums' }}>
        {row.bestSimilarity}%
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <Tooltip label={row.category} withArrow>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3px 8px',
              borderRadius: 999,
              background: categoryMeta.background,
              color: categoryMeta.color,
              fontSize: 11,
              fontWeight: 700,
              maxWidth: '100%'
            }}
          >
            {categoryMeta.lines ? (
              <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.15 }}>
                {categoryMeta.lines.map((line) => <span key={line}>{line}</span>)}
              </span>
            ) : (
              <span style={{ ...clampTextStyle(1) }}>{row.category}</span>
            )}
          </div>
        </Tooltip>
      </div>
      <div style={{ padding: '10px 12px', overflow: 'hidden' }}>
        <DetailBlock title="测试集" fields={detailFields.expected} />
      </div>
      <div style={{ padding: '10px 12px', overflow: 'hidden' }}>
        <DetailBlock title="LLM" fields={detailFields.actual} />
      </div>
      <div style={{ padding: '10px 12px', textAlign: 'right', color: '#0f172a', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontVariantNumeric: 'tabular-nums' }}>
        {row.outputCount}
      </div>
    </div>
  );
}

export function AnalysisDetailsTable({
  items = [],
  hallucinations = [],
  threshold = 70,
  baseFilters = EMPTY_DETAIL_FILTERS,
  title = '全部明细',
  bodyMaxHeight = 560
}) {
  const detailRows = useMemo(() => buildDetailRowModels(items, hallucinations), [items, hallucinations]);
  const [filters, setFilters] = useState({ ...EMPTY_DETAIL_FILTERS, ...baseFilters });
  const [sortState, setSortState] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const bodyRef = useRef(null);

  useEffect(() => {
    setFilters({ ...EMPTY_DETAIL_FILTERS, ...baseFilters });
  }, [baseFilters]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return undefined;

    const updateHeight = () => setViewportHeight(node.clientHeight);
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
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = 0;
    setScrollTop(0);
  }, [title, filters, sortState, detailRows.length]);

  const filteredRows = useMemo(() => applyDetailFilters(detailRows, filters), [detailRows, filters]);
  const sortedRows = useMemo(() => sortDetailRows(filteredRows, sortState), [filteredRows, sortState]);
  const columnOptions = useMemo(() => buildDetailColumnOptions(detailRows), [detailRows]);
  const layout = useMemo(() => buildVirtualLayout(sortedRows), [sortedRows]);
  const windowRange = useMemo(
    () => getVirtualWindow({
      layout,
      viewportHeight,
      scrollTop,
      overscan: 1
    }),
    [layout, scrollTop, viewportHeight]
  );
  const visibleRows = useMemo(
    () => (windowRange.end < windowRange.start ? [] : sortedRows.slice(windowRange.start, windowRange.end + 1)),
    [sortedRows, windowRange]
  );

  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', fontWeight: 800, color: '#0f172a' }}>
        {title}（{sortedRows.length}/{detailRows.length}）
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 1308 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_TEMPLATE,
              background: '#f8fafc',
              color: '#334155',
              borderBottom: '1px solid #e2e8f0',
              fontSize: 11
            }}
          >
            <HeaderCell>
              <ColumnFilterHeader
                label="报告"
                options={columnOptions.reportNames}
                value={filters.reportNames}
                onApply={(value) => startTransition(() => setFilters((prev) => ({ ...prev, reportNames: value })))}
                sortKey="reportName"
                sortState={sortState}
                onToggleSort={(sortKey) => setSortState((current) => getNextDetailSortState(current, sortKey))}
              />
            </HeaderCell>
            <HeaderCell>
              <ColumnFilterHeader
                label="指标"
                options={columnOptions.indicators}
                value={filters.indicators}
                onApply={(value) => startTransition(() => setFilters((prev) => ({ ...prev, indicators: value })))}
                sortKey="indicatorLabel"
                sortState={sortState}
                onToggleSort={(sortKey) => setSortState((current) => getNextDetailSortState(current, sortKey))}
              />
            </HeaderCell>
            <HeaderCell>
              <ColumnFilterHeader
                label="类型"
                options={columnOptions.valueTypes}
                value={filters.valueTypes}
                onApply={(value) => startTransition(() => setFilters((prev) => ({ ...prev, valueTypes: value })))}
                sortKey="rawValueType"
                sortState={sortState}
                onToggleSort={(sortKey) => setSortState((current) => getNextDetailSortState(current, sortKey))}
              />
            </HeaderCell>
            <HeaderCell>
              <SimilarityRangeHeader
                value={filters.similarityRange || [0, 100]}
                onApply={(value) => startTransition(() => setFilters((prev) => ({ ...prev, similarityRange: value })))}
                sortState={sortState}
                onToggleSort={(sortKey) => setSortState((current) => getNextDetailSortState(current, sortKey))}
              />
            </HeaderCell>
            <HeaderCell>
              <ColumnFilterHeader
                label="分类"
                options={columnOptions.categories}
                value={filters.categories}
                onApply={(value) => startTransition(() => setFilters((prev) => ({ ...prev, categories: value })))}
                sortKey="category"
                sortState={sortState}
                onToggleSort={(sortKey) => setSortState((current) => getNextDetailSortState(current, sortKey))}
              />
            </HeaderCell>
            <HeaderCell><StaticHeaderLabel label="测试集详情" /></HeaderCell>
            <HeaderCell><StaticHeaderLabel label="LLM详情" /></HeaderCell>
            <HeaderCell align="right">
              <ColumnFilterHeader
                label="输出数"
                options={columnOptions.outputCounts}
                value={filters.outputCounts}
                onApply={(value) => startTransition(() => setFilters((prev) => ({ ...prev, outputCounts: value })))}
                sortKey="outputCount"
                sortState={sortState}
                onToggleSort={(sortKey) => setSortState((current) => getNextDetailSortState(current, sortKey))}
              />
            </HeaderCell>
          </div>

          <div
            ref={bodyRef}
            style={{
              height: bodyMaxHeight,
              overflowY: 'auto',
              position: 'relative'
            }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            {sortedRows.length === 0 ? (
              <div style={{ padding: 24, color: '#64748b', fontSize: 12 }}>当前筛选下没有可显示的数据</div>
            ) : (
              <div
                style={{
                  position: 'relative',
                  height: layout.totalHeight
                }}
              >
                {visibleRows.map((row, index) => (
                  <DetailRow
                    key={row.key}
                    row={row}
                    threshold={threshold}
                    top={layout.offsets[windowRange.start + index] || 0}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { CATEGORY_META };
