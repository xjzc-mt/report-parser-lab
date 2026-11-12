import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Checkbox, Drawer } from '@mantine/core';
import {
  IconArrowsDiagonal,
  IconCheck,
  IconCopy,
  IconDownload,
  IconSparkles
} from '@tabler/icons-react';

import { isResultFound } from '../utils/extraction.js';

// 超过这个字数（或带换行）的提取值默认只显示 3 行，完整内容放到详情抽屉里查看。
const TEXT_PREVIEW_THRESHOLD = 90;

const DISPLAY_COLUMNS = [
  { key: 'source_file', label: '报告', className: 'col-report' },
  { key: 'indicator', label: '指标', className: 'col-indicator' },
  { key: 'type_year', label: '类型 / 年份', className: 'col-type-year' },
  { key: 'value', label: '提取值', className: 'col-value' },
  { key: 'pdf_numbers', label: 'PDF 页码', className: 'col-pages' }
];

function getTextLength(text) {
  return Array.from(text).length;
}

function parsePdfPages(pdfNumbers) {
  return String(pdfNumbers || '')
    .split(/[,，、;；\s]+/)
    .filter(Boolean);
}

function getDisplayValue(item) {
  if (!isResultFound(item)) {
    return { kind: 'empty', value: '未找到' };
  }

  const textValue = String(item.text_value || '').trim();
  if (textValue && textValue !== '未披露') {
    return { kind: 'text', value: textValue };
  }

  const numValue = item.num_value === undefined || item.num_value === null || item.num_value === ''
    ? ''
    : String(item.num_value);
  if (numValue) {
    const unit = String(item.unit || '').trim();
    const currency = String(item.currency || '').trim();
    const numerator = String(item.numerator_unit || '').trim();
    const denominator = String(item.denominator_unit || '').trim();
    return { kind: 'number', value: numValue, unit, currency, numerator, denominator };
  }

  return { kind: 'empty', value: '未找到' };
}

function getIndicatorName(item) {
  return item.indicator_name || item.indicator_code || '未命名指标';
}

function renderIndicator(item) {
  return (
    <div className="result-indicator">
      <strong title={getIndicatorName(item)}>{getIndicatorName(item)}</strong>
      {item.indicator_code ? <span>{item.indicator_code}</span> : null}
    </div>
  );
}

function renderValue(item, onInspect) {
  const value = getDisplayValue(item);

  if (value.kind === 'empty') {
    return <span className="cell-empty">{value.value}</span>;
  }

  if (value.kind === 'text') {
    const length = getTextLength(value.value);
    const isLong = length > TEXT_PREVIEW_THRESHOLD || value.value.includes('\n');
    return (
      <div className="result-value-cell">
        <p className={`result-value-text${isLong ? ' is-clamped' : ''}`}>{value.value}</p>
        {isLong ? (
          <div className="result-value-foot">
            <span className="result-value-count">共 {length} 字</span>
            <button type="button" className="result-value-expand" onClick={() => onInspect(item)}>
              展开全文
              <IconArrowsDiagonal size={13} stroke={1.9} />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const unitLabel = [value.currency, value.unit].filter(Boolean).join(' ');
  return (
    <div className="result-number">
      <strong>{value.value}</strong>
      {unitLabel ? <span className="result-unit">{unitLabel}</span> : null}
      {value.numerator || value.denominator ? (
        <span className="result-unit-detail">
          分子：{value.numerator || '—'} · 分母：{value.denominator || '—'}
        </span>
      ) : null}
    </div>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  }
}

function ResultDetailDrawer({ item, opened, onClose }) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    setCopied(false);
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, [item, opened]);

  if (!item) {
    return null;
  }

  const value = getDisplayValue(item);
  const pages = parsePdfPages(item.pdf_numbers);
  const valueType = item.value_type || item.indicator_type || '未知类型';
  const copyPayload = value.kind === 'number'
    ? [value.value, value.currency, value.unit].filter(Boolean).join(' ')
    : value.value;

  const handleCopy = async () => {
    const copiedOk = await copyText(copyPayload);
    if (!copiedOk) {
      return;
    }
    setCopied(true);
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      padding="lg"
      title="提取结果详情"
      closeButtonProps={{ 'aria-label': '关闭详情' }}
      styles={{
        content: {
          maxWidth: '100vw',
          background: 'rgba(9, 17, 30, 0.98)',
          borderLeft: '1px solid rgba(148, 163, 184, 0.16)',
          boxShadow: '-30px 0 80px rgba(2, 8, 23, 0.45)'
        },
        header: { background: 'transparent', paddingBottom: 8 },
        title: { color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 700 },
        body: { paddingTop: 4 },
        overlay: { background: 'rgba(2, 8, 23, 0.55)' }
      }}
    >
      <div className="result-detail">
        <header className="result-detail-head">
          <span className="result-detail-kicker">
            {valueType}
            {item.year ? ` · ${item.year}` : ''}
          </span>
          <h3>{getIndicatorName(item)}</h3>
          {item.indicator_code ? <span className="result-detail-code">{item.indicator_code}</span> : null}
        </header>

        <dl className="result-detail-meta">
          <div>
            <dt>来源报告</dt>
            <dd>{item.source_file || '—'}</dd>
          </div>
          <div>
            <dt>PDF 页码</dt>
            <dd>{pages.length ? pages.join(' / ') : '—'}</dd>
          </div>
        </dl>

        <section className="result-detail-value">
          <div className="result-detail-value-head">
            <h4>提取值</h4>
            {value.kind !== 'empty' ? (
              <button
                type="button"
                className={`result-detail-copy${copied ? ' is-copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? <IconCheck size={14} stroke={2} /> : <IconCopy size={14} stroke={1.9} />}
                {copied ? '已复制' : '复制'}
              </button>
            ) : null}
          </div>

          {value.kind === 'text' ? <p className="result-detail-text">{value.value}</p> : null}

          {value.kind === 'number' ? (
            <div className="result-detail-number">
              <strong>{value.value}</strong>
              {[value.currency, value.unit].filter(Boolean).length ? (
                <span className="result-unit">{[value.currency, value.unit].filter(Boolean).join(' ')}</span>
              ) : null}
              {value.numerator || value.denominator ? (
                <span className="result-unit-detail">
                  分子：{value.numerator || '—'} · 分母：{value.denominator || '—'}
                </span>
              ) : null}
            </div>
          ) : null}

          {value.kind === 'empty' ? (
            <p className="result-detail-empty">本条指标没有提取到可用结果，可以到原文对应页码确认是否为“未披露”。</p>
          ) : null}
        </section>
      </div>
    </Drawer>
  );
}

export function ResultsPanel({ results, displayedResults, filterOnlyFound, onToggleFilter, onExport, stats }) {
  // 关闭抽屉时保留 activeItem，让 Mantine 能播放滑出动画；下次打开再替换内容。
  const [activeItem, setActiveItem] = useState(null);
  const [detailOpened, setDetailOpened] = useState(false);

  const openDetail = (item) => {
    setActiveItem(item);
    setDetailOpened(true);
  };
  const failedFiles = Number(stats.failedFiles || 0);
  const failedFileDetails = Array.isArray(stats.failedFileDetails) ? stats.failedFileDetails : [];
  const hasResults = results.length > 0 || Boolean(stats.totalIndicators) || failedFiles > 0;
  const resultRows = results.length;
  const foundCount = Number.isFinite(Number(stats.foundIndicators))
    ? Number(stats.foundIndicators)
    : results.filter(isResultFound).length;
  const plannedCount = stats.totalIndicators || results.length || 0;
  const completedCount = Number.isFinite(Number(stats.completedIndicators))
    ? Number(stats.completedIndicators)
    : results.length;
  const startedCount = Number.isFinite(Number(stats.startedIndicators))
    ? Number(stats.startedIndicators)
    : completedCount;
  const unstartedCount = Number.isFinite(Number(stats.unstartedIndicators))
    ? Number(stats.unstartedIndicators)
    : 0;
  const executedBatches = Number.isFinite(Number(stats.executedBatches))
    ? Number(stats.executedBatches)
    : Number(stats.totalBatches || 0);
  const plannedBatches = Number(stats.totalBatches || 0);
  const hitRate = completedCount > 0 ? Math.round((foundCount / completedCount) * 100) : 0;

  if (!hasResults) {
    return null;
  }

  return (
    <section className="glass-panel results-panel">
      <div className="results-header">
        <div>
          <h2 className="section-title">
            <IconSparkles size={20} stroke={1.8} />
            <span>提取结果</span>
          </h2>
          <p className="section-caption">
            {displayedResults.length} / {results.length} 行正在显示
          </p>
        </div>
        <div className="results-actions">
          <Checkbox
            className="filter-toggle filter-toggle-mantine"
            label="只看已找到结果"
            checked={filterOnlyFound}
            onChange={(event) => onToggleFilter(event.currentTarget.checked)}
          />
          <Button
            type="button"
            variant="default"
            radius="xl"
            className="btn-secondary"
            onClick={onExport}
            leftSection={<IconDownload size={16} />}
          >
            导出 Excel
          </Button>
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-chip" title={`计划指标 ${plannedCount} 条`}>
          <strong>已处理</strong>
          <span>{completedCount}</span>
        </div>
        {startedCount > completedCount ? (
          <div className="summary-chip summary-chip--muted" title="已发出请求但尚未完成（如停止时仍在途）的输入指标">
            <strong>已启动</strong>
            <span>{startedCount}</span>
          </div>
        ) : null}
        <div className="summary-chip" title="按输入指标去重统计，不按年份结果行重复计算">
          <strong>已找到</strong>
          <span>{foundCount}</span>
        </div>
        <div className="summary-chip">
          <strong>命中率</strong>
          <span>{hitRate}%</span>
        </div>
        {resultRows !== completedCount ? (
          <div className="summary-chip summary-chip--muted" title="结果行可能包含多个年份；已处理按输入指标计数">
            <strong>结果行</strong>
            <span>{resultRows}</span>
          </div>
        ) : null}
        <div className="summary-chip" title={executedBatches !== plannedBatches ? `计划 ${plannedBatches || 0} 批` : ''}>
          <strong>批次数</strong>
          <span>{executedBatches}{executedBatches !== plannedBatches ? ` / ${plannedBatches}` : ''}</span>
        </div>
        {unstartedCount > 0 ? (
          <div className="summary-chip summary-chip--muted" title="停止后未启动的指标数量，不计入命中率分母">
            <strong>未运行</strong>
            <span>{unstartedCount}</span>
          </div>
        ) : null}
        {Number(stats.failedIndicators || 0) > 0 ? (
          <div className="summary-chip summary-chip--warning" title="模型调用失败后按未披露写入结果，可查看进度日志定位批次">
            <strong>失败指标</strong>
            <span>{stats.failedIndicators} 条 / {stats.failedBatches || 0} 批</span>
          </div>
        ) : null}
        {failedFiles > 0 ? (
          <div className="summary-chip summary-chip--warning" title="文件解析失败，未生成结果">
            <strong>失败文件</strong>
            <span>{failedFiles} 个</span>
          </div>
        ) : null}
        <div className="summary-chip">
          <strong>耗时</strong>
          <span>{stats.duration || 'N/A'}</span>
        </div>
        <div className="summary-chip" title={stats.pricingConfigured === false ? '该模型未配置价格表，无法可靠估算费用' : '按内置价格表估算，实际账单以供应商为准'}>
          <strong>成本</strong>
          <span>{stats.pricingConfigured === false ? '未配置单价' : `$${(stats.totalCost || 0).toFixed(4)}`}</span>
        </div>
      </div>

      {failedFiles > 0 ? (
        <div className="results-failure-banner">
          <strong>失败文件 {failedFiles} 个</strong>
          {failedFileDetails.length > 0 ? (
            <ul>
              {failedFileDetails.map((item, index) => (
                <li key={`${item.fileName || 'file'}-${index}`}>
                  {item.fileName || '未命名文件'}：{item.message || '文件解析失败'}
                </li>
              ))}
            </ul>
          ) : (
            <p>文件解析失败，未生成结果；可查看进度日志。</p>
          )}
        </div>
      ) : null}

      {displayedResults.length === 0 ? (
        <div className="results-empty">
          <h3 className="results-empty-title">
            {failedFiles > 0 ? '本次任务没有生成结果' : '当前筛选下没有可显示的数据'}
          </h3>
          <p className="results-empty-text">
            {failedFiles > 0
              ? `有 ${failedFiles} 个文件解析失败，未向模型发送空文档。`
              : '可以关闭“只看已找到结果”来查看全部处理结果。'}
          </p>
        </div>
      ) : (
        <div className="table-container results-table-container">
          <table className="results-main-table">
            <colgroup>
              {DISPLAY_COLUMNS.map((column) => (
                <col key={column.key} className={column.className} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {DISPLAY_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {displayedResults.map((item, index) => (
                <tr key={`${item.source_file || 'unknown'}-${item.indicator_code}-${item.year || 'na'}-${index}`}>
                  <td>
                    <span className="cell-file" title={item.source_file || ''}>{item.source_file || '—'}</span>
                  </td>
                  <td>{renderIndicator(item)}</td>
                  <td>
                    <div className="result-type-year">
                      <Badge variant="light" color="blue" radius="xl" className="value-type-badge">
                        {item.value_type || item.indicator_type || '未知类型'}
                      </Badge>
                      {item.year ? <span className="cell-mono">{item.year}</span> : null}
                    </div>
                  </td>
                  <td>{renderValue(item, openDetail)}</td>
                  <td>
                    <span className="cell-mono" title={item.pdf_numbers || ''}>{item.pdf_numbers || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ResultDetailDrawer
        item={activeItem}
        opened={detailOpened}
        onClose={() => setDetailOpened(false)}
      />
    </section>
  );
}
