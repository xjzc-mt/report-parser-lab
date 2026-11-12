import { Badge, Button } from '@mantine/core';
import { summarizePromptOptimizationUsage } from '../../utils/promptOptimizationUsage.js';

function formatDateTime(timestamp) {
  if (!timestamp) return '未知时间';
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false
  });
}

function getBestCandidate(run) {
  return (run?.candidates || []).find((item) => item.id === run.bestCandidateId) || run?.candidates?.[0] || null;
}

function getImprovement(run, candidate) {
  const bestScore = Number(candidate?.score?.overall ?? run?.bestScore ?? run?.baselineScore ?? 0);
  return bestScore - Number(run?.baselineScore ?? 0);
}

export function OptimizationReviewPanel({ run, onApply, onExport, onSendToPromptIteration }) {
  if (!run) {
    return <div className="prompt-optimization-empty">还没有可审核的优化结果。先完成一次优化运行。</div>;
  }

  const bestCandidate = getBestCandidate(run);
  const improvement = getImprovement(run, bestCandidate);
  const usage = summarizePromptOptimizationUsage(run);

  return (
    <div className="prompt-optimization-review">
      <div className="prompt-optimization-review-head">
        <div>
          <h3>{run.targetName || 'Prompt 优化结果'}</h3>
          <p className="section-caption">
            运行时间：{formatDateTime(run.createdAt)}，模型：{run.modelName || '未记录模型'}
          </p>
        </div>
        <div className="prompt-optimization-badge-row">
          <Badge variant="light" color="blue" radius="xl">
            {run.indicatorCode || '未记录指标'}
          </Badge>
          <Badge variant="light" color={run.appliedVersionId ? 'teal' : 'gray'} radius="xl">
            {run.appliedVersionId ? '已应用为新版本' : '待人工确认'}
          </Badge>
        </div>
      </div>

      <div className="prompt-optimization-scorecards">
        <div className="prompt-optimization-scorecard">
          <span>Baseline</span>
          <strong>{run.baselineScore ?? 0}</strong>
        </div>
        <div className="prompt-optimization-scorecard">
          <span>Best</span>
          <strong>{bestCandidate?.score?.overall ?? run.bestScore ?? run.baselineScore ?? 0}</strong>
        </div>
        <div className="prompt-optimization-scorecard">
          <span>提升</span>
          <strong>{improvement >= 0 ? `+${improvement}` : improvement}</strong>
        </div>
      </div>

      <div className="prompt-optimization-scorecards">
        <div className="prompt-optimization-scorecard">
          <span>优化 Token</span>
          <strong>{usage.optimizationInputTokens + usage.optimizationOutputTokens}</strong>
        </div>
        <div className="prompt-optimization-scorecard">
          <span>验证 Token</span>
          <strong>{usage.extractionInputTokens + usage.extractionOutputTokens}</strong>
        </div>
        <div className="prompt-optimization-scorecard">
          <span>总 Token</span>
          <strong>{usage.totalInputTokens + usage.totalOutputTokens}</strong>
        </div>
        <div className="prompt-optimization-scorecard">
          <span>预计成本</span>
          <strong>${usage.totalCostUsd.toFixed(6)}</strong>
        </div>
      </div>

      <p className="section-caption">
        其中优化阶段约 ${usage.optimizationCostUsd.toFixed(6)}，验证重跑阶段约 ${usage.extractionCostUsd.toFixed(6)}。成本按当前模型单价粗估。
      </p>

      <div className="prompt-optimization-diff">
        <div className="prompt-optimization-diff-card">
          <h4>基线用户提示词</h4>
          <pre>{run.baselinePromptText || '未记录基线 Prompt'}</pre>
        </div>
        <div className="prompt-optimization-diff-card">
          <h4>候选用户提示词</h4>
          <pre>{bestCandidate?.promptText || '未生成候选 Prompt'}</pre>
        </div>
      </div>

      <p className="section-caption">
        抽取系统提示词保持固定，本次优化仅对用户提示词进行诊断、改写与验证。
      </p>

      <div className="prompt-optimization-actions prompt-optimization-review-actions">
        <Button
          radius="xl"
          disabled={!bestCandidate || Boolean(run.appliedVersionId)}
          onClick={() => onApply?.(bestCandidate?.id)}
        >
          {run.appliedVersionId ? '已应用为新版本' : '应用为新版本'}
        </Button>
        <Button
          variant="default"
          radius="xl"
          onClick={() => onExport?.()}
          disabled={!run.resultRows?.length}
        >
          导出运行明细
        </Button>
        <Button
          variant="default"
          radius="xl"
          onClick={() => onSendToPromptIteration?.(bestCandidate?.id)}
          disabled={!bestCandidate}
        >
          带入快速迭代
        </Button>
      </div>

      <div className="prompt-optimization-samples">
        <h4>样本结果</h4>
        {bestCandidate?.sampleResults?.length ? (
          <table className="trace-table">
            <thead>
              <tr>
                <th>报告</th>
                <th>分数</th>
                <th>结果摘要</th>
              </tr>
            </thead>
            <tbody>
              {bestCandidate.sampleResults.map((item, index) => (
                <tr key={`${item.report_name}-${index}`}>
                  <td>{item.report_name || '-'}</td>
                  <td>{item.similarity ?? '-'}</td>
                  <td>{item.text || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="prompt-optimization-empty">暂无样本结果。</div>
        )}
      </div>

      <div className="optimization-trace-view">
        {run.strategySnapshot ? (
          <div className="prompt-optimization-strategy-summary">
            <h4>策略快照</h4>
            <div className="prompt-optimization-badge-row">
              <Badge variant="light" color="indigo" radius="xl">训练样本 {run.strategySnapshot.trainingLimit}</Badge>
              <Badge variant="light" color="grape" radius="xl">验证样本 {run.strategySnapshot.validationLimit}</Badge>
              <Badge variant="light" color="blue" radius="xl">扩窗 ±{run.strategySnapshot.windowRadius}</Badge>
            </div>
          </div>
        ) : null}

        {run.rounds?.length ? (
          <div className="prompt-optimization-rounds">
            <h4>流水线回放</h4>
            <div className="prompt-optimization-round-list">
              {run.rounds.map((round) => (
                <article key={`${round.indicatorCode}-${round.round}`} className="prompt-optimization-round-card">
                  <div className="prompt-optimization-round-head">
                    <strong>第 {round.round} 轮 · {round.indicatorCode || '-'} {round.indicatorName || ''}</strong>
                    <span>Baseline {round.baselineScore ?? 0} → Validation {round.validation?.averageSimilarity ?? 0}</span>
                  </div>
                  <div className="prompt-optimization-round-grid">
                    <div className="prompt-optimization-round-block">
                      <h5>诊断</h5>
                      <p>{round.diagnosis?.summary || '无'}</p>
                      {round.diagnosis?.rootCauses?.length ? (
                        <p className="section-caption">根因：{round.diagnosis.rootCauses.join('；')}</p>
                      ) : null}
                    </div>
                    <div className="prompt-optimization-round-block">
                      <h5>候选生成</h5>
                      <pre>{round.candidate?.promptText || '未生成'}</pre>
                    </div>
                    <div className="prompt-optimization-round-block">
                      <h5>验证评审</h5>
                      <p>{round.validation?.review?.summary || '无'}</p>
                      {round.validation?.review?.risks?.length ? (
                        <p className="section-caption">风险：{round.validation.review.risks.join('；')}</p>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="trace-hint">
          记录每轮原始状态和验证情况，便于回看优化过程。
        </div>
        <div className="trace-table-container">
          <table className="trace-table">
            <thead>
              <tr>
                <th>阶段</th>
                <th>说明</th>
                <th>Prompt</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {(run.traceEntries || []).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.phase || '-'}</td>
                  <td>{entry.message || '-'}</td>
                  <td className="td-code">{entry.promptText || '-'}</td>
                  <td>{entry.accepted || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
