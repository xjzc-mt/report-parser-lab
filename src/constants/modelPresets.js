export const TRANSPORT_TYPES = {
  GEMINI_NATIVE: 'gemini_native',
  ANTHROPIC_NATIVE: 'anthropic_native',
  OPENAI_COMPATIBLE: 'openai_compatible'
};

export const VENDOR_KEYS = {
  GEMINI: 'gemini',
  CLAUDE: 'claude',
  OPENAI: 'openai',
  ONEAPI: 'oneapi',
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
    supportsPdfUpload: true
  },
  [MODEL_PAGE_KEYS.CHUNKING_TEST]: {
    supportsPdfUpload: true
  }
};

export const DEFAULT_PRESET_DEFINITIONS = [
  {
    id: 'preset_gemini_default',
    name: '默认 Gemini',
    vendorKey: VENDOR_KEYS.GEMINI,
    transportType: TRANSPORT_TYPES.GEMINI_NATIVE,
    apiKeyEnv: 'VITE_DEFAULT_GEMINI_API_KEY',
    baseUrlEnv: 'VITE_DEFAULT_GEMINI_BASE_URL',
    modelEnv: 'VITE_DEFAULT_GEMINI_MODEL',
    requestOptionsEnv: 'VITE_DEFAULT_GEMINI_REQUEST_OPTIONS',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    capabilities: {
      supportsPdfUpload: true,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: false
    }
  },
  {
    id: 'preset_claude_default',
    name: '默认 Claude',
    vendorKey: VENDOR_KEYS.CLAUDE,
    transportType: TRANSPORT_TYPES.ANTHROPIC_NATIVE,
    apiKeyEnv: 'VITE_DEFAULT_ANTHROPIC_API_KEY',
    baseUrlEnv: 'VITE_DEFAULT_ANTHROPIC_BASE_URL',
    modelEnv: 'VITE_DEFAULT_ANTHROPIC_MODEL',
    requestOptionsEnv: 'VITE_DEFAULT_ANTHROPIC_REQUEST_OPTIONS',
    defaultBaseUrl: 'https://api.anthropic.com',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: false,
      supportsStreaming: false
    }
  },
  {
    id: 'preset_openai_default',
    name: '默认 OpenAI',
    vendorKey: VENDOR_KEYS.OPENAI,
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    apiKeyEnv: 'VITE_DEFAULT_OPENAI_API_KEY',
    baseUrlEnv: 'VITE_DEFAULT_OPENAI_BASE_URL',
    modelEnv: 'VITE_DEFAULT_OPENAI_MODEL',
    requestOptionsEnv: 'VITE_DEFAULT_OPENAI_REQUEST_OPTIONS',
    defaultBaseUrl: 'https://api.openai.com/v1',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: true
    }
  },
  {
    id: 'preset_oneapi_default',
    name: '默认 OneAPI',
    vendorKey: VENDOR_KEYS.ONEAPI,
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    apiKeyEnv: 'VITE_DEFAULT_ONEAPI_API_KEY',
    baseUrlEnv: 'VITE_DEFAULT_ONEAPI_BASE_URL',
    modelEnv: 'VITE_DEFAULT_ONEAPI_MODEL',
    requestOptionsEnv: 'VITE_DEFAULT_ONEAPI_REQUEST_OPTIONS',
    defaultBaseUrl: '',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: true
    }
  },
  {
    id: 'preset_deepseek_default',
    name: '默认 DeepSeek',
    vendorKey: VENDOR_KEYS.DEEPSEEK,
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    apiKeyEnv: 'VITE_DEFAULT_DEEPSEEK_API_KEY',
    baseUrlEnv: 'VITE_DEFAULT_DEEPSEEK_BASE_URL',
    modelEnv: 'VITE_DEFAULT_DEEPSEEK_MODEL',
    requestOptionsEnv: 'VITE_DEFAULT_DEEPSEEK_REQUEST_OPTIONS',
    defaultBaseUrl: 'https://api.deepseek.com',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: false,
      supportsStreaming: true
    }
  },
  {
    id: 'preset_glm_default',
    name: '默认 GLM',
    vendorKey: VENDOR_KEYS.GLM,
    transportType: TRANSPORT_TYPES.OPENAI_COMPATIBLE,
    apiKeyEnv: 'VITE_DEFAULT_GLM_API_KEY',
    baseUrlEnv: 'VITE_DEFAULT_GLM_BASE_URL',
    modelEnv: 'VITE_DEFAULT_GLM_MODEL',
    requestOptionsEnv: 'VITE_DEFAULT_GLM_REQUEST_OPTIONS',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: true,
      supportsStreaming: true
    }
  }
];
