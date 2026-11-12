import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPromptOptimizationExportSheets } from '../src/services/promptOptimizationExportService.js';

test('导出 sheets 会包含 token 与 cost 汇总', () => {
  const sheets = buildPromptOptimizationExportSheets({
    id: 'run_1',
    indicatorCode: 'E1',
    modelName: 'gemini-2.5-pro',
    tokenStats: {
      optInput: 1000,
      optOutput: 200,
      extractInput: 300,
      extractOutput: 50
    }
  });

  assert.equal(Array.isArray(sheets.token_cost), true);
  assert.equal(sheets.token_cost.length, 3);
  assert.deepEqual(
    sheets.token_cost.map((row) => row.phase),
    ['optimization', 'extraction', 'total']
  );
  assert.equal(sheets.token_cost[0].input_tokens, 1000);
  assert.equal(sheets.token_cost[1].output_tokens, 50);
  assert.equal(sheets.token_cost[2].estimated_cost_usd > 0, true);
});
