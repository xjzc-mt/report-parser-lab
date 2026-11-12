import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAB_BRAND,
  APP_TABS,
  APP_MAIN_TABS,
  TEST_SET_SUBTABS,
  DATA_PREP_SUBTABS,
  DATA_PREP_TOOLS
} from '../src/constants/labNavigation.js';

test('LAB_BRAND 定义实验室品牌文案', () => {
  assert.deepEqual(LAB_BRAND, {
    title: 'Report Parser Lab',
    subtitle: '提取 · 验收 · 迭代'
  });
});

test('APP_TABS 包含平铺后的主要入口与副入口', () => {
  assert.deepEqual(
    APP_TABS.map((tab) => tab.key),
    ['prompt-iteration', 'model-validation', 'prompt-optimization', 'online-validation', 'data-prep', 'docs']
  );
  assert.deepEqual(
    APP_TABS.map((tab) => tab.label),
    ['Prompt快速迭代', '模型结果验收', 'Prompt自动优化', '线上验证', '数据预处理', '说明文档']
  );
});

test('APP_MAIN_TABS 包含 5 个主要功能入口且数据预处理带下拉标记', () => {
  assert.equal(APP_MAIN_TABS.length, 5);
  const dataPrep = APP_MAIN_TABS.find((tab) => tab.key === 'data-prep');
  assert.equal(dataPrep?.hasDropdown, true);
});

test('测试集工作台兼容导出 3 个子页定义', () => {
  assert.equal(TEST_SET_SUBTABS.length, 3);
  assert.equal(TEST_SET_SUBTABS[0].key, 'prompt-iteration');
  assert.equal(TEST_SET_SUBTABS[0].label, 'Prompt快速迭代');
});

test('DATA_PREP_TOOLS 包含 3 列预处理工具及清晰说明', () => {
  assert.deepEqual(
    DATA_PREP_TOOLS.map((tab) => tab.key),
    ['chunking', 'pdf-compress', 'token-estimation']
  );
  assert.deepEqual(
    DATA_PREP_TOOLS.map((tab) => tab.label),
    ['Chunking测试', 'PDF压缩', 'Token统计']
  );
  assert.equal(DATA_PREP_TOOLS[0].description, '拆分文档，检查切片效果。');
  assert.equal(DATA_PREP_TOOLS[1].description, '压缩 PDF，减小上传体积。');
  assert.equal(DATA_PREP_TOOLS[2].description, '估算输入 Token 与调用成本。');
});
