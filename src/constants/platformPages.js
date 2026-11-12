export const PLATFORM_PAGE_KEYS = {
  PROMPT_ITERATION: 'prompt-iteration',
  MODEL_VALIDATION: 'model-validation',
  PROMPT_OPTIMIZATION: 'prompt-optimization',
  ONLINE_VALIDATION: 'online-validation',
  CHUNKING: 'chunking',
  PDF_COMPRESS: 'pdf-compress',
  TOKEN_ESTIMATION: 'token-estimation',
  DOCS: 'docs'
};

export const TEMPORARILY_DEFERRED_PAGE_KEYS = new Set([
  PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION
]);

export const PLATFORM_PAGE_DEFINITIONS = [
  {
    key: PLATFORM_PAGE_KEYS.PROMPT_ITERATION,
    label: 'Prompt快速迭代',
    parent: 'test-workbench',
    defaults: [
      { key: 'maxRetries', label: '模型调用最大尝试次数', type: 'integer', min: 1, max: 10, fallback: 3 }
    ]
  },
  {
    key: PLATFORM_PAGE_KEYS.MODEL_VALIDATION,
    label: '模型结果验收',
    parent: 'test-workbench',
    defaults: []
  },
  {
    key: PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION,
    label: 'Prompt自动优化',
    parent: 'test-workbench',
    defaults: [
      { key: 'maxRetries', label: '模型调用最大尝试次数', type: 'integer', min: 1, max: 10, fallback: 3 },
      { key: 'maxOptIterations', label: '最大优化轮次', type: 'integer', min: 1, max: 10, fallback: 2 },
      { key: 'targetScoreThreshold', label: '目标分数阈值', type: 'integer', min: 0, max: 100, fallback: 90 }
    ]
  },
  {
    key: PLATFORM_PAGE_KEYS.ONLINE_VALIDATION,
    label: '线上验证工作台',
    parent: 'online-validation',
    defaults: [
      { key: 'batchSize', label: '批次大小', type: 'select', options: [40, 50, 100], fallback: 40 },
      { key: 'maxConcurrency', label: '最大并发', type: 'select', options: [1, 2, 5], fallback: 2 },
      { key: 'maxRetries', label: '模型调用最大尝试次数', type: 'integer', min: 1, max: 10, fallback: 3 }
    ]
  },
  {
    key: PLATFORM_PAGE_KEYS.CHUNKING,
    label: 'Chunking测试',
    parent: 'data-prep',
    defaults: []
  },
  {
    key: PLATFORM_PAGE_KEYS.PDF_COMPRESS,
    label: 'PDF压缩',
    parent: 'data-prep',
    defaults: [
      { key: 'quality', label: '图片质量', type: 'number', min: 0.1, max: 1, step: 0.05, fallback: 0.6 },
      { key: 'dimension', label: '最大边长', type: 'select', options: [800, 1200, 1600, 2000], fallback: 1200 },
      { key: 'grayscale', label: '灰度压缩', type: 'boolean', fallback: false },
      { key: 'smartMode', label: '智能压缩', type: 'boolean', fallback: true },
      { key: 'smartThreshold', label: '智能压缩阈值', type: 'integer', min: 0, max: 1000000, fallback: 60000 }
    ]
  },
  {
    key: PLATFORM_PAGE_KEYS.TOKEN_ESTIMATION,
    label: 'Token统计',
    parent: 'data-prep',
    defaults: []
  },
  {
    key: PLATFORM_PAGE_KEYS.DOCS,
    label: '说明文档',
    parent: 'docs',
    defaults: []
  }
];

export const PLATFORM_PAGE_KEY_SET = new Set(PLATFORM_PAGE_DEFINITIONS.map((item) => item.key));

export function getPlatformPageDefinition(pageKey) {
  return PLATFORM_PAGE_DEFINITIONS.find((item) => item.key === pageKey) || null;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizePageDefaultValue(field, value) {
  if (!field) {
    return value;
  }

  if (field.type === 'integer') {
    const parsed = Number(value);
    const fallback = Number(field.fallback || 0);
    const normalized = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
    return clampNumber(normalized, Number(field.min ?? normalized), Number(field.max ?? normalized));
  }

  if (field.type === 'number') {
    const parsed = Number(value);
    const fallback = Number(field.fallback || 0);
    const normalized = Number.isFinite(parsed) ? parsed : fallback;
    return clampNumber(normalized, Number(field.min ?? normalized), Number(field.max ?? normalized));
  }

  if (field.type === 'boolean') {
    return Boolean(value);
  }

  if (field.type === 'select') {
    const options = Array.isArray(field.options) ? field.options : [];
    return options.includes(value) ? value : field.fallback;
  }

  return value;
}

export function createDefaultPageConfig() {
  return PLATFORM_PAGE_DEFINITIONS.reduce((acc, definition) => {
    acc[definition.key] = {
      // 自动优化本轮暂缓上线；仍保留页面开关，后续可由管理员显式开启。
      enabled: definition.key !== PLATFORM_PAGE_KEYS.PROMPT_OPTIMIZATION,
      defaults: definition.defaults.reduce((defaults, field) => {
        defaults[field.key] = field.fallback;
        return defaults;
      }, {})
    };
    return acc;
  }, {});
}

export function normalizePageConfig(rawPages = {}) {
  const defaults = createDefaultPageConfig();
  const source = rawPages && typeof rawPages === 'object' && !Array.isArray(rawPages) ? rawPages : {};

  return PLATFORM_PAGE_DEFINITIONS.reduce((acc, definition) => {
    const rawPage = source[definition.key] && typeof source[definition.key] === 'object'
      ? source[definition.key]
      : {};
    const rawDefaults = rawPage.defaults && typeof rawPage.defaults === 'object' && !Array.isArray(rawPage.defaults)
      ? rawPage.defaults
      : {};

    acc[definition.key] = {
      enabled: rawPage.enabled === undefined ? defaults[definition.key].enabled : Boolean(rawPage.enabled),
      defaults: definition.defaults.reduce((fieldAcc, field) => {
        fieldAcc[field.key] = normalizePageDefaultValue(
          field,
          rawDefaults[field.key] === undefined ? defaults[definition.key].defaults[field.key] : rawDefaults[field.key]
        );
        return fieldAcc;
      }, {})
    };
    return acc;
  }, {});
}

export function getPageParent(pageKey) {
  return getPlatformPageDefinition(pageKey)?.parent || '';
}
