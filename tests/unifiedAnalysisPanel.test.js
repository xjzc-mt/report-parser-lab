import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPinnedSummaryConfig,
  buildAnalysisPanelExportPayload,
  buildHallucinationToggleConfig,
  buildAnalysisToolbarTheme,
  getRightPanelListBodyStyle,
  getNextPanelSortState,
  sortPanelChildren
} from '../src/utils/unifiedAnalysisPanel.js';

function makeMetrics(overrides = {}) {
  return {
    testItemCount: 351,
    modelOutputCount: 345,
    strictPassRate: 0.76,
    lenientPassRate: 0.76,
    recall: 0.81,
    precision: 0.78,
    duplicateRate: 0,
    missRate: 0.19,
    averageBestSimilarity: 64,
    hallucinationRate: 0.18,
    ...overrides
  };
}

test('buildPinnedSummaryConfig 生成不重复且带中文标签的摘要横条配置', () => {
  const summary = buildPinnedSummaryConfig({
    label: '比亚迪：2024年度可持续发展报告',
    metrics: makeMetrics()
  });

  assert.equal(summary.title, '比亚迪：2024年度可持续发展报告');
  assert.equal(summary.subtitle, '输出 345项');
  assert.deepEqual(summary.badges.map((item) => item.text), [
    '测试项 351',
    '严格 76%',
    '宽松 76%',
    '召回 81%',
    '精确 78%',
    '重复 0%',
    '漏摘 19%',
    '相似 64%',
    '幻觉 18%'
  ]);
});

test('buildAnalysisPanelExportPayload 导出当前面板列表并按首列排序', () => {
  const payload = buildAnalysisPanelExportPayload({
    label: '全部报告',
    section: 'per-report',
    level: 'root',
    children: [
      { label: '报告B', metrics: makeMetrics({ testItemCount: 2, modelOutputCount: 3, strictPassRate: 0.5, averageBestSimilarity: 88 }) },
      { label: '报告A', metrics: makeMetrics({ testItemCount: 4, modelOutputCount: 5, strictPassRate: 1, averageBestSimilarity: 91 }) }
    ],
    metrics: makeMetrics()
  });

  assert.equal(payload.sheetName, '分析面板');
  assert.match(payload.fileName, /^analysis_panel_全部报告_/);
  assert.deepEqual(payload.rows, [
    {
      报告: '报告A',
      测试项: 4,
      输出项: 5,
      严格通过: '100%',
      宽松通过: '76%',
      召回率: '81%',
      精确率: '78%',
      重复率: '0%',
      漏摘率: '19%',
      相似度: '91%',
      幻觉率: '18%'
    },
    {
      报告: '报告B',
      测试项: 2,
      输出项: 3,
      严格通过: '50%',
      宽松通过: '76%',
      召回率: '81%',
      精确率: '78%',
      重复率: '0%',
      漏摘率: '19%',
      相似度: '88%',
      幻觉率: '18%'
    }
  ]);
});

test('buildAnalysisPanelExportPayload 在无子节点时导出当前节点摘要行', () => {
  const payload = buildAnalysisPanelExportPayload({
    label: '数值型',
    section: 'cross-report',
    level: 'valueType',
    children: [],
    metrics: makeMetrics({ testItemCount: 145, modelOutputCount: 161 })
  });

  assert.deepEqual(payload.rows, [
    {
      指标: '数值型',
      测试项: 145,
      输出项: 161,
      严格通过: '76%',
      宽松通过: '76%',
      召回率: '81%',
      精确率: '78%',
      重复率: '0%',
      漏摘率: '19%',
      相似度: '64%',
      幻觉率: '18%'
    }
  ]);
});

test('buildHallucinationToggleConfig 返回更清晰的开关按钮文案与样式', () => {
  assert.deepEqual(buildHallucinationToggleConfig(true), {
    label: '统计幻觉',
    checked: true
  });

  assert.deepEqual(buildHallucinationToggleConfig(false), {
    label: '统计幻觉',
    checked: false
  });
});

test('buildAnalysisToolbarTheme 返回收窄后的 A2 表头尺寸与配色', () => {
  const theme = buildAnalysisToolbarTheme();

  assert.equal(theme.controlHeight, 36);
  assert.equal(theme.actionHeight, 38);
  assert.equal(theme.thresholdInputWidth, 56);
  assert.equal(theme.toolbarPadding, '9px 16px 8px');
  assert.match(theme.toolbarBackground, /d9e3f0|dce6f2|e6edf7/i);
  assert.match(theme.cardBackground, /f3f7fc|f5f8fd|ffffff/i);
});

test('getNextPanelSortState 支持默认 升序 降序三态循环', () => {
  assert.deepEqual(getNextPanelSortState(null, 'label'), { key: 'label', direction: 'asc' });
  assert.deepEqual(getNextPanelSortState({ key: 'label', direction: 'asc' }, 'label'), { key: 'label', direction: 'desc' });
  assert.equal(getNextPanelSortState({ key: 'label', direction: 'desc' }, 'label'), null);
  assert.deepEqual(getNextPanelSortState({ key: 'precision', direction: 'asc' }, 'label'), { key: 'label', direction: 'asc' });
});

test('sortPanelChildren 默认按指标类型固定顺序展示', () => {
  const children = [
    { label: '强度型', metrics: { testItemCount: 1, precision: 0.8 } },
    { label: '文字型', metrics: { testItemCount: 2, precision: 0.6 } },
    { label: '数值型', metrics: { testItemCount: 3, precision: 0.7 } }
  ];

  assert.deepEqual(
    sortPanelChildren(children, null, 'type').map((item) => item.label),
    ['文字型', '数值型', '强度型']
  );
});

test('sortPanelChildren 支持按首列和指标列三态排序', () => {
  const children = [
    { label: '报告B', metrics: { testItemCount: 2, precision: 0.8 } },
    { label: '报告A', metrics: { testItemCount: 4, precision: 0.6 } },
    { label: '报告C', metrics: { testItemCount: 1, precision: 0.9 } }
  ];

  assert.deepEqual(
    sortPanelChildren(children, { key: 'label', direction: 'asc' }, 'report').map((item) => item.label),
    ['报告A', '报告B', '报告C']
  );

  assert.deepEqual(
    sortPanelChildren(children, { key: 'label', direction: 'desc' }, 'report').map((item) => item.label),
    ['报告C', '报告B', '报告A']
  );

  assert.deepEqual(
    sortPanelChildren(children, { key: 'precision', direction: 'desc' }, 'report').map((item) => item.label),
    ['报告C', '报告B', '报告A']
  );
});

test('getRightPanelListBodyStyle 在指标概览较多时取 12 条高度与左树高度中的较大值', () => {
  assert.equal(
    getRightPanelListBodyStyle({ type: 'indicator', childCount: 8, treeBodyHeight: 520 }),
    undefined
  );

  assert.deepEqual(
    getRightPanelListBodyStyle({ type: 'indicator', childCount: 18, treeBodyHeight: 280 }),
    { maxHeight: 382, overflowY: 'auto' }
  );

  assert.deepEqual(
    getRightPanelListBodyStyle({ type: 'indicator', childCount: 18, treeBodyHeight: 560, maxViewportHeight: 480 }),
    { maxHeight: 480, overflowY: 'auto' }
  );
});
