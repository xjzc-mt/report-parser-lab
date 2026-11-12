import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExtractionSummaryRows } from '../src/services/exportService.js';

function summaryMap(rows) {
  return Object.fromEntries(rows.slice(2).map(([key, value]) => [key, value]));
}

test('停止场景的导出摘要使用输入指标统计，不再用结果行数相减', () => {
  const summary = summaryMap(buildExtractionSummaryRows(
    Array.from({ length: 40 }, (_, index) => ({ indicator_code: `E${index}`, num_value: 1 })),
    {
      totalIndicators: 81,
      completedIndicators: 40,
      startedIndicators: 40,
      unstartedIndicators: 41,
      foundIndicators: 40,
      failedIndicators: 0,
      totalBatches: 3,
      executedBatches: 1,
      completedBatches: 1
    }
  ));

  assert.equal(summary['计划指标数（过滤后）'], 81);
  assert.equal(summary['已处理指标数'], 40);
  assert.equal(summary['未运行指标数'], 41);
  assert.equal(summary['已找到指标数'], 40);
  assert.equal(summary['已处理指标中未找到'], 0);
  assert.equal(summary['结果行数'], 40);
  assert.equal(summary['已执行批次数'], 1);
  assert.equal(summary['计划批次数'], 3);
});
