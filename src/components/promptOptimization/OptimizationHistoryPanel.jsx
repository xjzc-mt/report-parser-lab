import { Badge, Button, Table } from '@mantine/core';

function formatDateTime(timestamp) {
  if (!timestamp) return '未知时间';
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false
  });
}

function getBestScore(run) {
  const bestCandidate = (run?.candidates || []).find((item) => item.id === run.bestCandidateId) || run?.candidates?.[0];
  return Number(bestCandidate?.score?.overall ?? run?.bestScore ?? run?.baselineScore ?? 0);
}

function getRunLabel(run) {
  const targetName = String(run?.targetName || '').trim();
  if (targetName) {
    return targetName;
  }
  const indicatorCode = String(run?.indicatorCode || '').trim();
  const indicatorName = String(run?.indicatorName || '').trim();
  if (indicatorCode || indicatorName) {
    return `${indicatorCode} ${indicatorName}`.trim();
  }
  return run?.id || '未命名运行';
}

export function OptimizationHistoryPanel({ runs, onSelectRun, onClearHistory }) {
  if (!runs.length) {
    return <div className="prompt-optimization-empty">还没有历史运行。跑过一次后，这里会保留优化快照。</div>;
  }

  return (
    <div className="prompt-optimization-history">
      <div className="panel-header">
        <div>
          <h3>历史运行</h3>
          <p>这里只加载运行摘要，点击查看时再按需读取完整回放，避免历史积累导致变卡。</p>
        </div>
        {onClearHistory ? (
          <Button variant="default" color="red" onClick={() => onClearHistory?.()}>
            清空历史
          </Button>
        ) : null}
      </div>
      <Table className="prompt-optimization-history-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>时间</Table.Th>
            <Table.Th>目标</Table.Th>
            <Table.Th>模型</Table.Th>
            <Table.Th>分数</Table.Th>
            <Table.Th>状态</Table.Th>
            <Table.Th>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {runs.map((run) => (
            <Table.Tr key={run.id}>
              <Table.Td>{formatDateTime(run.createdAt)}</Table.Td>
              <Table.Td>{getRunLabel(run)}</Table.Td>
              <Table.Td>{run.modelName || '未记录模型'}</Table.Td>
              <Table.Td>{run.baselineScore ?? 0} → {getBestScore(run)}</Table.Td>
              <Table.Td>
                <Badge variant="light" color={run.appliedVersionId ? 'teal' : 'gray'} radius="xl">
                  {run.appliedVersionId ? '已应用' : '未应用'}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Button variant="subtle" onClick={() => onSelectRun?.(run)}>
                  查看
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}
