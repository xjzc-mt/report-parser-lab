import { Badge, Progress } from '@mantine/core';

export function ProgressPanel({ progress, eyebrow = 'Run Status', title = '提取进度', maxLogs = null }) {
  if (!progress.visible) {
    return null;
  }

  const displayedLogs = maxLogs ? progress.logs.slice(-maxLogs) : progress.logs;
  const hasFailure = Boolean(progress.hasFailure);

  return (
    <section className="progress-section glass-subpanel">
      <div className="progress-title-row">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h3 className="progress-kicker">{title}</h3>
        </div>
        <Badge
          variant="light"
          color={hasFailure ? 'red' : (progress.isLoading ? 'blue' : 'teal')}
          radius="xl"
          className={`progress-badge ${hasFailure ? 'failed' : (progress.isLoading ? 'running' : 'done')}`}
        >
          {hasFailure ? '有失败' : (progress.isLoading ? '进行中' : '已完成')}
        </Badge>
      </div>

      <div className="progress-header">
        <span className="status-text">{progress.status || 'Waiting...'}</span>
        <span className="percentage-text">{progress.percentage}%</span>
      </div>
      <Progress.Root size={12} radius="xl" className="progress-bar-container">
        <Progress.Section
          value={progress.percentage}
          className={`progress-bar ${progress.isLoading ? 'loading' : ''}`}
        />
      </Progress.Root>
      <div className="progress-meta">共记录 {progress.logs.length} 条日志</div>
      <div className="progress-log">
        {displayedLogs.map((entry) => (
          <p key={entry.id} className="progress-log-entry">
            <span className="progress-log-time">[{entry.time}]</span>
            <span className="progress-log-message">{entry.message}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
