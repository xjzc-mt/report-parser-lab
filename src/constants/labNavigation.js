export const LAB_BRAND = {
  title: 'Report Parser Lab',
  subtitle: '提取 · 验收 · 迭代'
};

export const APP_MAIN_TABS = [
  { key: 'prompt-iteration', label: 'Prompt快速迭代' },
  { key: 'model-validation', label: '模型结果验收' },
  { key: 'prompt-optimization', label: 'Prompt自动优化' },
  { key: 'online-validation', label: '线上验证' },
  { key: 'data-prep', label: '数据预处理', hasDropdown: true }
];

export const APP_SECONDARY_TABS = [
  { key: 'docs', label: '说明文档' }
];

export const APP_TABS = [
  ...APP_MAIN_TABS,
  ...APP_SECONDARY_TABS
];

export const DATA_PREP_TOOLS = [
  {
    key: 'chunking',
    label: 'Chunking测试',
    description: '拆分文档，检查切片效果。'
  },
  {
    key: 'pdf-compress',
    label: 'PDF压缩',
    description: '压缩 PDF，减小上传体积。'
  },
  {
    key: 'token-estimation',
    label: 'Token统计',
    description: '估算输入 Token 与调用成本。'
  }
];

export const DATA_PREP_SUBTABS = DATA_PREP_TOOLS;

export const TEST_SET_SUBTABS = [
  {
    key: 'prompt-iteration',
    label: 'Prompt快速迭代',
    legacyLabel: '完整流程模式'
  },
  {
    key: 'model-validation',
    label: '模型结果验收',
    legacyLabel: '快速验收模式'
  },
  {
    key: 'prompt-optimization',
    label: 'Prompt自动优化',
    legacyLabel: '快速优化模式'
  }
];
