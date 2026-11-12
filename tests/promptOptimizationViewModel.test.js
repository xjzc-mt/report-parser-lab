import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPromptOptimizationBatchTargets,
  buildPromptOptimizationIndicatorCatalog,
  buildPromptOptimizationIndicatorGroups,
  buildIncomingOptimizationWorkspaceState,
  buildPromptOptimizationRunSnapshot,
  buildPromptOptimizationSelectionSummary,
  buildPromptOptimizationTargetOptions
} from '../src/utils/promptOptimizationViewModel.js';

test('buildPromptOptimizationTargetOptions 会按预选指标过滤并生成标签', () => {
  const options = buildPromptOptimizationTargetOptions([
    { indicator_code: 'E1', indicator_name: '范围一排放' },
    { indicator_code: 'E1', indicator_name: '范围一排放' },
    { indicator_code: 'E2', indicator_name: '范围二排放' }
  ], ['E2']);

  assert.deepEqual(options, [
    {
      value: 'E2',
      label: 'E2 · 范围二排放',
      code: 'E2',
      name: '范围二排放'
    }
  ]);
});

test('buildPromptOptimizationRunSnapshot 会根据旧优化结果生成单候选 run', () => {
  const snapshot = buildPromptOptimizationRunSnapshot({
    assetId: 'asset_1',
    baselineVersionId: 'pver_1',
    baselinePromptText: '提取排放总量',
    targetName: '排放总量',
    rows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        report_name: 'A',
        similarity: 40
      },
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        report_name: 'B',
        similarity: 60
      }
    ],
    updatedRows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        report_name: 'A',
        similarity: 40,
        improved_prompt: '严格输出 JSON',
        post_similarity: 82
      },
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        report_name: 'B',
        similarity: 60,
        improved_prompt: '严格输出 JSON',
        post_similarity: 82
      }
    ],
    iterationDetails: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        iter: 0,
        prompt: '提取排放总量',
        report_name: 'A',
        similarity: 40,
        llm_text: '旧结果',
        is_accepted: 'ORIGINAL'
      },
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        iter: 1,
        prompt: '严格输出 JSON',
        report_name: 'A',
        similarity: 82,
        llm_text: '新结果',
        is_accepted: 'YES'
      }
    ],
    llmSettings: {
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    },
    now: () => 1000
  });

  assert.equal(snapshot.run.assetId, 'asset_1');
  assert.equal(snapshot.run.bestCandidateId, 'cand_E1_1');
  assert.equal(snapshot.run.baselineScore, 50);
  assert.equal(snapshot.run.candidates[0].score.overall, 82);
  assert.equal(snapshot.run.traceEntries.length, 2);
  assert.equal(snapshot.run.targetName, '排放总量');
  assert.equal(snapshot.run.resultRows.length, 2);
});

test('buildPromptOptimizationIndicatorCatalog 会聚合指标相似度和类型', () => {
  const catalog = buildPromptOptimizationIndicatorCatalog([
    { indicator_code: 'E1', indicator_name: '范围一排放', value_type_1: '文字型', similarity: 40 },
    { indicator_code: 'E1', indicator_name: '范围一排放', value_type_1: 'TEXT', similarity: 60 },
    { indicator_code: 'N1', indicator_name: '废水排放量', value_type: 'NUMERIC', similarity: 82 },
    { indicator_code: 'I1', indicator_name: '强度指标', value_type_1: 'INTENSITY', similarity: 55 }
  ]);

  assert.deepEqual(catalog, [
    {
      code: 'E1',
      name: '范围一排放',
      valueType: '文字型',
      rowCount: 2,
      averageSimilarity: 50,
      minSimilarity: 40,
      maxSimilarity: 60,
      label: 'E1 · 范围一排放'
    },
    {
      code: 'I1',
      name: '强度指标',
      valueType: '强度型',
      rowCount: 1,
      averageSimilarity: 55,
      minSimilarity: 55,
      maxSimilarity: 55,
      label: 'I1 · 强度指标'
    },
    {
      code: 'N1',
      name: '废水排放量',
      valueType: '数值型',
      rowCount: 1,
      averageSimilarity: 82,
      minSimilarity: 82,
      maxSimilarity: 82,
      label: 'N1 · 废水排放量'
    }
  ]);
});

test('buildPromptOptimizationIndicatorGroups 会按类型分组并按相似度区间筛选', () => {
  const groups = buildPromptOptimizationIndicatorGroups([
    { indicator_code: 'E1', indicator_name: '范围一排放', value_type_1: '文字型', similarity: 40 },
    { indicator_code: 'N1', indicator_name: '废水排放量', value_type_1: '数值型', similarity: 82 },
    { indicator_code: 'I1', indicator_name: '强度指标', value_type_1: 'INTENSITY', similarity: 55 }
  ], {
    minSimilarity: 30,
    maxSimilarity: 70
  });

  assert.deepEqual(groups, [
    {
      type: '文字型',
      items: [
        {
          code: 'E1',
          name: '范围一排放',
          valueType: '文字型',
          rowCount: 1,
          averageSimilarity: 40,
          minSimilarity: 40,
          maxSimilarity: 40,
          label: 'E1 · 范围一排放'
        }
      ]
    },
    {
      type: '强度型',
      items: [
        {
          code: 'I1',
          name: '强度指标',
          valueType: '强度型',
          rowCount: 1,
          averageSimilarity: 55,
          minSimilarity: 55,
          maxSimilarity: 55,
          label: 'I1 · 强度指标'
        }
      ]
    }
  ]);
});

test('buildPromptOptimizationIndicatorGroups 支持按指标编码和名称模糊搜索', () => {
  const groups = buildPromptOptimizationIndicatorGroups([
    { indicator_code: 'E1', indicator_name: '范围一排放', value_type_1: '文字型', similarity: 40 },
    { indicator_code: 'N1', indicator_name: '废水排放量', value_type_1: '数值型', similarity: 82 },
    { indicator_code: 'I1', indicator_name: '强度指标', value_type_1: 'INTENSITY', similarity: 55 }
  ], {
    minSimilarity: 0,
    maxSimilarity: 100,
    query: '废水'
  });

  assert.deepEqual(groups, [
    {
      type: '数值型',
      items: [
        {
          code: 'N1',
          name: '废水排放量',
          valueType: '数值型',
          rowCount: 1,
          averageSimilarity: 82,
          minSimilarity: 82,
          maxSimilarity: 82,
          label: 'N1 · 废水排放量'
        }
      ]
    }
  ]);
});

test('buildPromptOptimizationSelectionSummary 会汇总已选指标与类型分布', () => {
  const summary = buildPromptOptimizationSelectionSummary(
    [
      { code: 'E1', name: '范围一排放', valueType: '文字型', rowCount: 2 },
      { code: 'N1', name: '废水排放量', valueType: '数值型', rowCount: 3 },
      { code: 'E2', name: '范围二排放', valueType: '文字型', rowCount: 1 }
    ],
    ['E1', 'N1']
  );

  assert.deepEqual(summary, {
    selectedCount: 2,
    selectedRowCount: 5,
    typeBreakdown: [
      { type: '文字型', count: 1 },
      { type: '数值型', count: 1 }
    ],
    previewLabels: ['E1 · 范围一排放', 'N1 · 废水排放量']
  });
});

test('buildIncomingOptimizationWorkspaceState 会把多指标跳转上下文重置到优化配置页', () => {
  const nextState = buildIncomingOptimizationWorkspaceState({
    comparisonRows: [
      { indicator_code: 'E2', indicator_name: '范围二排放' },
      { indicator_code: 'E1', indicator_name: '范围一排放' }
    ],
    comparisonFile: { name: 'comparison.xlsx' },
    selectedCodes: ['E2', 'E1']
  });

  assert.deepEqual(nextState, {
    comparisonRows: [
      { indicator_code: 'E2', indicator_name: '范围二排放' },
      { indicator_code: 'E1', indicator_name: '范围一排放' }
    ],
    comparisonFile: { name: 'comparison.xlsx' },
    selectedTargetCodes: ['E2', 'E1'],
    activeTab: 'setup'
  });
});

test('buildPromptOptimizationBatchTargets 会按选中指标构建批量优化队列', () => {
  const targets = buildPromptOptimizationBatchTargets([
    { indicator_code: 'E2', indicator_name: '范围二排放', report_name: '报告A' },
    { indicator_code: 'E1', indicator_name: '范围一排放', report_name: '报告B' },
    { indicator_code: 'E2', indicator_name: '范围二排放', report_name: '报告C' }
  ], ['E2', 'E1']);

  assert.deepEqual(targets, [
    {
      code: 'E2',
      name: '范围二排放',
      rows: [
        { indicator_code: 'E2', indicator_name: '范围二排放', report_name: '报告A' },
        { indicator_code: 'E2', indicator_name: '范围二排放', report_name: '报告C' }
      ]
    },
    {
      code: 'E1',
      name: '范围一排放',
      rows: [
        { indicator_code: 'E1', indicator_name: '范围一排放', report_name: '报告B' }
      ]
    }
  ]);
});
