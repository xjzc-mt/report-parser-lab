export const TRANSPORT_TYPES = {
  GEMINI_NATIVE: 'gemini_native',
  ANTHROPIC_NATIVE: 'anthropic_native',
  OPENAI_COMPATIBLE: 'openai_compatible',
  COMPANY_PROXY: 'company_proxy'
};

export const VENDOR_KEYS = {
  GEMINI: 'gemini',
  CLAUDE: 'claude',
  OPENAI: 'openai',
  ONEAPI: 'oneapi',
  MIO: 'mio',
  DEEPSEEK: 'deepseek',
  GLM: 'glm',
  CUSTOM: 'custom'
};

export const MODEL_PRESET_STORAGE_KEY = 'llm_lab_model_presets';
export const PAGE_MODEL_SELECTIONS_STORAGE_KEY = 'llm_lab_page_model_selections';
export const GLOBAL_MODEL_SELECTION_STORAGE_KEY = 'llm_lab_global_model_selection';
export const PLATFORM_DEFAULT_PRESET_ID = 'preset_platform_default';

export const MODEL_PAGE_KEYS = {
  PROMPT_ITERATION: 'prompt-iteration',
  PROMPT_OPTIMIZATION: 'prompt-optimization',
  ONLINE_VALIDATION: 'online-validation',
  CHUNKING_TEST: 'chunking-test',
  TOKEN_ESTIMATION: 'token-estimation'
};

export const PAGE_REQUIRED_CAPABILITIES = {
  [MODEL_PAGE_KEYS.PROMPT_ITERATION]: {
    supportsPdfUpload: true,
    supportsJsonMode: true
  },
  [MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]: {
    supportsJsonMode: true
  },
  [MODEL_PAGE_KEYS.ONLINE_VALIDATION]: {
    // 线上验证优先 PDF 直传；不支持时会回退 PDF 文本解析，因此只要求 JSON 输出。
    supportsJsonMode: true
  },
  [MODEL_PAGE_KEYS.CHUNKING_TEST]: {
    supportsPdfUpload: true
  }
};
