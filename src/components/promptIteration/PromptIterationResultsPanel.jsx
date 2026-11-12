import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Collapse, SegmentedControl, Tabs } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import { normalizeJsonToTableData } from '../../utils/promptIterationModel.js';

function getRunKey(run, index = 0) {
  return `${run?.createdAt || 'run'}-${index}`;
}

function formatDateTime(timestamp) {
  if (!timestamp) return '未知时间';
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false
  });
}

function formatDuration(durationMs) {
  if (durationMs == null) return '-';
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(1)} s`;
  return `${Math.round(durationMs / 1000)} s`;
}

function formatUsage(usage) {
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  if (!inputTokens && !outputTokens) {
    return '-';
  }
  return `${inputTokens} / ${outputTokens}`;
}

function getStatusColor(status) {
  return status === 'success' ? 'teal' : 'red';
}

function getStatusLabel(status) {
  return status === 'success' ? '成功' : '失败';
}

function getJsonStatusLabel(status) {
  if (status === 'success') return 'JSON 成功';
  if (status === 'invalid') return 'JSON 非法';
  return '未解析出 JSON';
}

function EmptyState({ text }) {
  return <div className="prompt-iteration-empty">{text}</div>;
}

function renderCellValue(value, key) {
  if (value === null || value === undefined || value === '') {
    return <span className="prompt-iteration-cell-empty">-</span>;
  }
  const str = String(value).trim();
  if (str === '未披露' || str === 'NOT_FOUND' || str.toLowerCase() === 'none') {
    return (
      <Badge variant="light" color="gray" size="xs" radius="sm">
        {str}
      </Badge>
    );
  }
  if (key === 'pdf_numbers') {
    return (
      <Badge variant="light" color="blue" size="xs" radius="sm">
        {str.startsWith('P.') || str.startsWith('p.') ? str : `P. ${str}`}
      </Badge>
    );
  }
  if (key === 'year') {
    return (
      <Badge variant="outline" color="cyan" size="xs" radius="sm">
        {str}
      </Badge>
    );
  }
  if (key === 'num_value') {
    return <span className="prompt-iteration-cell-num">{str}</span>;
  }
  if (typeof value === 'object') {
    return <code>{JSON.stringify(value)}</code>;
  }
  return <span className="prompt-iteration-cell-text">{str}</span>;
}

function ParsedJsonBlock({ parsedJson }) {
  const tableData = useMemo(() => normalizeJsonToTableData(parsedJson), [parsedJson]);
  const [viewMode, setViewMode] = useState('table');

  if (!parsedJson) return null;

  const showTable = tableData.canRenderTable && viewMode === 'table';

  return (
    <div className="prompt-iteration-json-section">
      <div className="prompt-iteration-json-header">
        <div className="prompt-iteration-json-title-row">
          <span className="prompt-iteration-raw-label">解析出的 JSON</span>
          {tableData.canRenderTable ? (
            <Badge size="xs" variant="light" color="teal" radius="xl">
              {tableData.rows.length} 条数据
            </Badge>
          ) : null}
        </div>
        {tableData.canRenderTable ? (
          <SegmentedControl
            size="xs"
            radius="xl"
            value={viewMode}
            onChange={setViewMode}
            data={[
              { label: '表格展示', value: 'table' },
              { label: 'JSON 原文', value: 'json' }
            ]}
          />
        ) : null}
      </div>

      {showTable ? (
        <div className="prompt-iteration-parsed-table-shell">
          <table className="prompt-iteration-parsed-table">
            <thead>
              <tr>
                {tableData.columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.rows.map((row, rIndex) => (
                <tr key={`row-${rIndex}`}>
                  {tableData.columns.map((col) => (
                    <td key={`${rIndex}-${col.key}`}>
                      {renderCellValue(row[col.key], col.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="prompt-iteration-raw-block prompt-iteration-json-block">
          {JSON.stringify(parsedJson, null, 2)}
        </pre>
      )}
    </div>
  );
}

function PromptIterationRawItem({ item, runCreatedAt }) {
  const [rawExpanded, setRawExpanded] = useState(false);

  return (
    <article key={`${runCreatedAt}-${item.fileId || item.fileName}-raw`} className="prompt-iteration-raw-item">
      <div className="prompt-iteration-raw-header">
        <div>
          <strong>{item.fileName || '未命名文件'}</strong>
          <div className="prompt-iteration-raw-submeta">
            <span>{item.scopeLabel || '全文'}</span>
            <span>{formatDuration(item.durationMs)}</span>
          </div>
        </div>
        <Badge variant="light" color={getStatusColor(item.status)} radius="xl">
          {getStatusLabel(item.status)}
        </Badge>
      </div>

      {item.parsedJson ? (
        <ParsedJsonBlock parsedJson={item.parsedJson} />
      ) : null}

      <div className="prompt-iteration-raw-section">
        <button
          type="button"
          onClick={() => setRawExpanded((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            background: 'none',
            border: 'none',
            padding: '2px 0',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <span className="prompt-iteration-raw-label">
            {item.status === 'error' ? '错误信息 / 原始返回' : '原始返回'}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.78rem',
              color: 'var(--text-secondary)'
            }}
          >
            {rawExpanded ? '收起' : '展开'}
            {rawExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </span>
        </button>
        <Collapse in={rawExpanded}>
          <pre className="prompt-iteration-raw-block">
            {item.rawResponse || item.errorMessage || '暂无返回内容'}
          </pre>
        </Collapse>
      </div>
    </article>
  );
}

function RunResultsView({ run, title, description }) {
  if (!run) {
    return <EmptyState text="还没有可展示的运行结果。" />;
  }

  return (
    <div className="prompt-iteration-run-view">
      <div className="prompt-iteration-section-head">
        <div>
          <h3 className="prompt-iteration-section-title">{title}</h3>
          <p className="section-caption">{description}</p>
        </div>
        <div className="prompt-iteration-run-meta">
          <Badge variant="light" color="blue" radius="xl">{run.name || '未命名实验'}</Badge>
          <Badge variant="light" color="teal" radius="xl">
            成功 {run.summary?.successCount || 0}/{run.summary?.total || 0}
          </Badge>
          <Badge variant="light" color="gray" radius="xl">
            {run.modelName || '未记录模型'}
          </Badge>
        </div>
      </div>

      <div className="prompt-iteration-run-submeta">
        <span>运行时间：{formatDateTime(run.createdAt)}</span>
        <span>Provider：{run.providerType || '未记录'}</span>
        <span>失败文件：{run.summary?.errorCount || 0}</span>
      </div>

      <div className="prompt-iteration-summary-shell">
        <table className="prompt-iteration-summary-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>范围</th>
              <th>状态</th>
              <th>JSON</th>
              <th>摘要</th>
              <th>Tokens</th>
              <th>耗时</th>
            </tr>
          </thead>
          <tbody>
            {(run.results || []).map((item) => (
              <tr key={`${run.createdAt}-${item.fileId || item.fileName}`}>
                <td>{item.fileName || '未命名文件'}</td>
                <td>{item.scopeLabel || '全文'}</td>
                <td>
                  <Badge variant="light" color={getStatusColor(item.status)} radius="xl">
                    {getStatusLabel(item.status)}
                  </Badge>
                </td>
                <td>{getJsonStatusLabel(item.jsonParseStatus)}</td>
                <td>{item.summaryText || '-'}</td>
                <td>{formatUsage(item.usage)}</td>
                <td>{formatDuration(item.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="prompt-iteration-section-head prompt-iteration-raw-section-head">
        <div>
          <h3 className="prompt-iteration-section-title">模型原始返回</h3>
          <p className="section-caption">
            原样保留每个文件的回复内容，便于定位结构化成功与失败的具体原因。
          </p>
        </div>
      </div>

      <div className="prompt-iteration-raw-list">
        {(run.results || []).map((item) => (
          <PromptIterationRawItem
            key={`${run.createdAt}-${item.fileId || item.fileName}-raw`}
            item={item}
            runCreatedAt={run.createdAt}
          />
        ))}
      </div>
    </div>
  );
}

export function PromptIterationResultsPanel({
  activeTab,
  onTabChange,
  currentRun,
  history,
  errorMsg,
  onDeleteHistoryRun,
  onClearHistory,
  historyActionsDisabled = false
}) {
  const [selectedHistoryKey, setSelectedHistoryKey] = useState('');

  useEffect(() => {
    if (!history.length) {
      setSelectedHistoryKey('');
      return;
    }

    setSelectedHistoryKey((previous) => {
      const exists = history.some((run, index) => getRunKey(run, index) === previous);
      return exists ? previous : getRunKey(history[0], 0);
    });
  }, [history]);

  const selectedHistoryRun = useMemo(
    () => history.find((run, index) => getRunKey(run, index) === selectedHistoryKey) || history[0] || null,
    [history, selectedHistoryKey]
  );

  return (
    <Tabs
      value={activeTab}
      onChange={(value) => onTabChange?.(value || 'current')}
      className="prompt-iteration-results"
    >
      <Tabs.List>
        <Tabs.Tab value="current">当前结果</Tabs.Tab>
        <Tabs.Tab value="history">历史记录</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="current" pt="md">
        {errorMsg ? (
          <div className="testbench-error-block prompt-iteration-result-error">
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {currentRun ? (
          <RunResultsView
            run={currentRun}
            title="结果汇总"
            description="先看统一表格，再往下查看每个文件的原始回复。"
          />
        ) : (
          <EmptyState text="还没有当前运行结果。上传 PDF、填写 Prompt 后即可开始验证。" />
        )}
      </Tabs.Panel>

      <Tabs.Panel value="history" pt="md">
        {history.length === 0 ? (
          <EmptyState text="还没有历史记录。跑过一次后，这里会保留最近的实验快照。" />
        ) : (
          <div className="prompt-iteration-history-layout">
            <div className="prompt-iteration-history-list">
              <div className="prompt-iteration-history-toolbar">
                <span>共 {history.length} 条历史</span>
                <Button
                  size="xs"
                  radius="xl"
                  variant="default"
                  color="red"
                  disabled={historyActionsDisabled}
                  onClick={() => onClearHistory?.()}
                >
                  清空历史
                </Button>
              </div>
              {history.map((run, index) => {
                const historyKey = getRunKey(run, index);
                const isActive = historyKey === selectedHistoryKey;

                return (
                  <div
                    key={historyKey}
                    className={`prompt-iteration-history-item ${isActive ? 'active' : ''}`}
                  >
                    <button
                      type="button"
                      className="prompt-iteration-history-select"
                      onClick={() => setSelectedHistoryKey(historyKey)}
                    >
                      <strong>{run.name || '未命名实验'}</strong>
                      <span>{formatDateTime(run.createdAt)}</span>
                      <span>{run.modelName || '未记录模型'}</span>
                      <span>成功 {run.summary?.successCount || 0}/{run.summary?.total || 0}</span>
                    </button>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      radius="xl"
                      size="sm"
                      disabled={historyActionsDisabled}
                      onClick={() => onDeleteHistoryRun?.(index)}
                      aria-label={`删除第 ${index + 1} 条历史记录`}
                    >
                      <IconTrash size={14} stroke={1.8} />
                    </ActionIcon>
                  </div>
                );
              })}
            </div>

            <div className="prompt-iteration-history-detail">
              <RunResultsView
                run={selectedHistoryRun}
                title="历史快照"
                description="回看某次 Prompt 试跑的完整结果，继续比较不同文件之间的表现。"
              />
            </div>
          </div>
        )}
      </Tabs.Panel>
    </Tabs>
  );
}
