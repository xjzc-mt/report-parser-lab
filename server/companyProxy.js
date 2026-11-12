import { PLATFORM_PAGE_KEY_SET } from '../src/constants/platformPages.js';
import { HttpError } from './errors.js';

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'apiUrl',
  'apiKey',
  'baseUrl',
  'url',
  'headers',
  'requestOptions',
  'authorization'
]);
const FORBIDDEN_OPTION_KEYS = new Set([
  'apiKey',
  'apiUrl',
  'baseUrl',
  'url',
  'headers',
  'model',
  'messages',
  'contents',
  'system',
  'system_instruction',
  'input',
  'stream'
]);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp'
]);
const MAX_TEXT_LENGTH = 2 * 1024 * 1024;
const MAX_PDF_INPUTS = 10;
const MAX_UPSTREAM_RESPONSE_BYTES = 10 * 1024 * 1024;
const ANTHROPIC_VERSION = '2023-06-01';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimString(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function redactSecrets(text, secrets = []) {
  let result = String(text || '');
  for (const secret of secrets) {
    if (secret) {
      result = result.split(secret).join('[redacted]');
    }
  }
  return result.slice(0, 1000);
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function buildGeminiUrl(baseUrl, modelName) {
  const base = stripTrailingSlash(baseUrl);
  if (base.endsWith(':generateContent')) {
    return base;
  }
  const model = stripTrailingSlash(modelName).replace(/^models\//, '');
  return `${base}/models/${encodeURIComponent(model)}:generateContent`;
}

function buildOpenAiUrl(baseUrl) {
  const base = stripTrailingSlash(baseUrl);
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

function buildAnthropicUrl(baseUrl) {
  const base = stripTrailingSlash(baseUrl);
  if (base.endsWith('/messages')) return base;
  if (base.endsWith('/v1')) return `${base}/messages`;
  return `${base}/v1/messages`;
}

function cloneOptions(value, depth = 0) {
  if (depth > 5 || !isPlainObject(value)) {
    return {};
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_OPTION_KEYS.has(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    if (isPlainObject(item)) {
      result[key] = cloneOptions(item, depth + 1);
    } else if (Array.isArray(item)) {
      result[key] = item.map((entry) => (isPlainObject(entry) ? cloneOptions(entry, depth + 1) : entry));
    } else if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) {
      result[key] = item;
    }
  }
  return result;
}

function mergeRequestOptions(connection, model) {
  return {
    ...cloneOptions(connection?.requestOptions || {}),
    ...cloneOptions(model?.requestOptions || {})
  };
}

function mergeGeminiBody(baseBody, requestOptions) {
  const options = cloneOptions(requestOptions);
  const { generationConfig, extra_body: extraBody, ...restOptions } = options;
  const normalizedExtraBody = isPlainObject(extraBody) ? extraBody : {};
  const { generationConfig: extraGenerationConfig, ...extraRest } = normalizedExtraBody;

  return {
    ...baseBody,
    ...restOptions,
    ...extraRest,
    generationConfig: {
      ...(baseBody.generationConfig || {}),
      ...(isPlainObject(generationConfig) ? generationConfig : {}),
      ...(isPlainObject(extraGenerationConfig) ? extraGenerationConfig : {})
    }
  };
}

function mergeChatBody(baseBody, requestOptions) {
  const options = cloneOptions(requestOptions);
  const { extra_body: extraBody, ...restOptions } = options;
  return {
    ...baseBody,
    ...restOptions,
    ...(isPlainObject(extraBody) ? extraBody : {}),
    model: baseBody.model,
    messages: baseBody.messages
  };
}

function normalizeBinaryInputs(payload) {
  const pdfBase64 = typeof payload.pdfBase64 === 'string' ? payload.pdfBase64.trim() : '';
  const rawInputs = payload.pdfInputs;

  if (pdfBase64 && rawInputs !== undefined) {
    throw new HttpError(400, 'INVALID_BINARY_INPUT', 'pdfBase64 与 pdfInputs 只能二选一。');
  }

  const inputs = [];
  if (pdfBase64) {
    inputs.push({ mimeType: 'application/pdf', data: pdfBase64, label: '' });
  } else if (rawInputs !== undefined) {
    if (!Array.isArray(rawInputs)) {
      throw new HttpError(400, 'INVALID_BINARY_INPUT', 'pdfInputs 必须是数组。');
    }
    if (rawInputs.length > MAX_PDF_INPUTS) {
      throw new HttpError(400, 'INVALID_BINARY_INPUT', `附件数量不能超过 ${MAX_PDF_INPUTS} 个。`);
    }
    for (const item of rawInputs) {
      if (!isPlainObject(item)) {
        throw new HttpError(400, 'INVALID_BINARY_INPUT', '附件格式无效。');
      }
      const mimeType = trimString(item.mimeType || 'application/pdf', 100).toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new HttpError(400, 'INVALID_BINARY_INPUT', `不支持的附件类型：${mimeType || '未知'}`);
      }
      const data = typeof item.data === 'string' ? item.data.trim() : '';
      if (!data) {
        throw new HttpError(400, 'INVALID_BINARY_INPUT', '附件内容为空。');
      }
      inputs.push({
        mimeType,
        data,
        label: trimString(item.label, 200)
      });
    }
  }

  return inputs;
}

function getModelForConnection(connection, modelName) {
  const target = trimString(modelName, 200);
  if (!target) {
    throw new HttpError(400, 'MODEL_REQUIRED', '请指定公司模型名称。');
  }
  const model = connection.models.find((item) => item.name === target);
  if (!model) {
    throw new HttpError(400, 'MODEL_NOT_ALLOWED', '请求的公司模型不在后台允许列表中。');
  }
  if (!model.enabled) {
    throw new HttpError(409, 'MODEL_DISABLED', '该模型已在后台禁用。');
  }
  if (!model.capabilities?.supportsJsonMode) {
    throw new HttpError(400, 'MODEL_NO_JSON', '该模型未声明支持 JSON 输出，当前页面不能使用。');
  }
  return model;
}

function getConnection(configStore, connectionId) {
  const id = trimString(connectionId, 80);
  if (!id) {
    throw new HttpError(400, 'CONNECTION_REQUIRED', '请指定公司连接。');
  }
  const connection = configStore.getConnectionWithSecret(id);
  if (!connection) {
    throw new HttpError(404, 'CONNECTION_NOT_FOUND', '公司连接不存在或已被删除。');
  }
  if (!connection.enabled) {
    throw new HttpError(409, 'CONNECTION_DISABLED', '公司连接已在后台禁用。');
  }
  if (!connection.apiKey) {
    throw new HttpError(409, 'CONNECTION_KEY_MISSING', '公司连接尚未配置 API Key。');
  }
  return connection;
}

function validatePayload(payload) {
  if (!isPlainObject(payload)) {
    throw new HttpError(400, 'INVALID_PAYLOAD', '请求体必须是 JSON 对象。');
  }
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload) {
      throw new HttpError(400, 'FORBIDDEN_PAYLOAD_FIELD', `请求体不允许包含字段：${key}`);
    }
  }

  const pageKey = trimString(payload.pageKey, 80);
  if (pageKey && !PLATFORM_PAGE_KEY_SET.has(pageKey)) {
    throw new HttpError(400, 'INVALID_PAGE_KEY', '请求的页面标识无效。');
  }

  const systemPrompt = typeof payload.systemPrompt === 'string' ? payload.systemPrompt : '';
  const userPrompt = typeof payload.userPrompt === 'string' ? payload.userPrompt : '';
  if (!userPrompt.trim()) {
    throw new HttpError(400, 'PROMPT_REQUIRED', '用户提示词不能为空。');
  }
  if (systemPrompt.length > MAX_TEXT_LENGTH || userPrompt.length > MAX_TEXT_LENGTH) {
    throw new HttpError(400, 'PROMPT_TOO_LARGE', '提示词长度超过服务端限制。');
  }

  return {
    connectionId: payload.connectionId,
    modelName: payload.model,
    pageKey,
    systemPrompt,
    userPrompt,
    binaryInputs: normalizeBinaryInputs(payload)
  };
}

async function readResponsePayload(response) {
  const text = await response.text();
  if (text.length > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new HttpError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', '上游模型响应过大。');
  }
  if (!response.ok) {
    return { data: null, text };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new HttpError(502, 'UPSTREAM_INVALID_JSON', '上游模型返回了无法解析的响应。');
  }
  return { data, text };
}

function extractGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
    : '';
  return {
    text,
    usage: {
      input_tokens: Number(data?.usageMetadata?.promptTokenCount || 0),
      output_tokens: Number(data?.usageMetadata?.candidatesTokenCount || 0)
    }
  };
}

function extractAnthropicResponse(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const text = blocks
    .filter((block) => block?.type === 'text')
    .map((block) => String(block.text || ''))
    .join('');
  return {
    text,
    usage: {
      input_tokens: Number(data?.usage?.input_tokens || 0),
      output_tokens: Number(data?.usage?.output_tokens || 0)
    }
  };
}

function extractOpenAiResponse(data) {
  const text = data?.choices?.[0]?.message?.content;
  return {
    text: typeof text === 'string' ? text : '',
    usage: {
      input_tokens: Number(data?.usage?.prompt_tokens || 0),
      output_tokens: Number(data?.usage?.completion_tokens || 0)
    }
  };
}

export function createCompanyProxy({
  configStore,
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  timeoutMs = Number(env.UPSTREAM_TIMEOUT_MS || 300000),
  now = () => Date.now()
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('公司模型转发需要可用的 fetch 实现。');
  }

  const logUpstreamErrors = String(env.LOG_UPSTREAM_ERRORS || '').toLowerCase() === 'true';
  const normalizedTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) >= 1000
    ? Number(timeoutMs)
    : 300000;

  async function requestUpstream({ url, headers, body, secrets, connectionId, modelName, pageKey }) {
    const startedAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const { data, text } = await readResponsePayload(response);
      const durationMs = now() - startedAt;

      if (!response.ok) {
        if (logUpstreamErrors) {
          logger.warn?.('company_proxy_upstream_error', {
            connectionId,
            modelName,
            pageKey,
            status: response.status,
            durationMs,
            body: redactSecrets(text, secrets)
          });
        }
        throw new HttpError(
          502,
          'UPSTREAM_ERROR',
          `上游模型服务返回 ${response.status}，请检查公司连接配置或稍后重试。`,
          { upstreamStatus: response.status }
        );
      }

      logger.info?.('company_proxy_request', {
        connectionId,
        modelName,
        pageKey,
        status: response.status,
        durationMs
      });
      return data;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error?.name === 'AbortError') {
        throw new HttpError(504, 'UPSTREAM_TIMEOUT', '上游模型服务响应超时，请稍后重试。');
      }
      throw new HttpError(502, 'UPSTREAM_UNREACHABLE', '无法连接上游模型服务，请检查后台连接地址和网络。');
    } finally {
      clearTimeout(timer);
    }
  }

  async function callGemini({ connection, model, systemPrompt, userPrompt, binaryInputs, pageKey, testMode = false }) {
    const parts = [];
    for (const input of binaryInputs) {
      if (input.label) {
        parts.push({ text: input.label });
      }
      parts.push({
        inline_data: {
          mime_type: input.mimeType,
          data: input.data
        }
      });
    }
    parts.push({ text: userPrompt });

    const body = mergeGeminiBody({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1,
        maxOutputTokens: testMode ? 16 : (model.maxTokens || 8192)
      }
    }, mergeRequestOptions(connection, model));

    const data = await requestUpstream({
      url: buildGeminiUrl(connection.baseUrl, model.name),
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': connection.apiKey
      },
      body,
      secrets: [connection.apiKey],
      connectionId: connection.id,
      modelName: model.name,
      pageKey: pageKey || ''
    });

    const result = extractGeminiResponse(data);
    if (!result.text) {
      throw new HttpError(502, 'UPSTREAM_EMPTY_RESPONSE', '上游模型没有返回文本内容。');
    }
    return result;
  }

  async function callAnthropic({ connection, model, systemPrompt, userPrompt, binaryInputs, pageKey, testMode = false }) {
    if (binaryInputs.length > 0) {
      throw new HttpError(400, 'MODEL_NO_PDF', '当前公司连接不支持 PDF/图片直传。');
    }

    const body = mergeChatBody({
      model: model.name,
      max_tokens: testMode ? 16 : (model.maxTokens || 8192),
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }, mergeRequestOptions(connection, model));

    const data = await requestUpstream({
      url: buildAnthropicUrl(connection.baseUrl),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': connection.apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body,
      secrets: [connection.apiKey],
      connectionId: connection.id,
      modelName: model.name,
      pageKey: pageKey || ''
    });

    const result = extractAnthropicResponse(data);
    if (!result.text) {
      throw new HttpError(502, 'UPSTREAM_EMPTY_RESPONSE', '上游模型没有返回文本内容。');
    }
    return result;
  }

  function buildOpenAiUserContent(userPrompt, binaryInputs) {
    if (!Array.isArray(binaryInputs) || binaryInputs.length === 0) {
      return userPrompt;
    }

    const content = [{ type: 'text', text: userPrompt }];
    for (const input of binaryInputs) {
      if (String(input.mimeType || '').startsWith('image/')) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${input.mimeType};base64,${input.data}`
          }
        });
      } else {
        content.push({
          type: 'file',
          file: {
            filename: input.label || 'document.pdf',
            file_data: `data:${input.mimeType || 'application/pdf'};base64,${input.data}`
          }
        });
      }
    }
    return content;
  }

  async function callOpenAi({ connection, model, systemPrompt, userPrompt, binaryInputs, pageKey, testMode = false }) {
    const body = mergeChatBody({
      model: model.name,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildOpenAiUserContent(userPrompt, binaryInputs) }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: testMode ? 16 : (model.maxTokens || 8192)
    }, mergeRequestOptions(connection, model));

    const data = await requestUpstream({
      url: buildOpenAiUrl(connection.baseUrl),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.apiKey}`
      },
      body,
      secrets: [connection.apiKey],
      connectionId: connection.id,
      modelName: model.name,
      pageKey: pageKey || ''
    });

    const result = extractOpenAiResponse(data);
    if (!result.text) {
      throw new HttpError(502, 'UPSTREAM_EMPTY_RESPONSE', '上游模型没有返回文本内容。');
    }
    return result;
  }

  async function callProvider({ connection, model, systemPrompt, userPrompt, binaryInputs, pageKey, testMode = false }) {
    const startedAt = now();
    let result;
    if (connection.transportType === 'gemini_native') {
      result = await callGemini({ connection, model, systemPrompt, userPrompt, binaryInputs, pageKey, testMode });
    } else if (connection.transportType === 'anthropic_native') {
      result = await callAnthropic({ connection, model, systemPrompt, userPrompt, binaryInputs, pageKey, testMode });
    } else {
      result = await callOpenAi({ connection, model, systemPrompt, userPrompt, binaryInputs, pageKey, testMode });
    }

    logger.info?.('company_proxy_complete', {
      connectionId: connection.id,
      modelName: model.name,
      pageKey: pageKey || '',
      durationMs: now() - startedAt,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens
    });
    return result;
  }

  return {
    async handle(payload) {
      const validated = validatePayload(payload);
      const connection = getConnection(configStore, validated.connectionId);
      const model = getModelForConnection(connection, validated.modelName);

      if (validated.binaryInputs.length > 0 && !model.capabilities.supportsPdfUpload) {
        throw new HttpError(400, 'MODEL_NO_PDF', '当前公司模型未声明支持 PDF/图片直传。');
      }

      const result = await callProvider({
        connection,
        model,
        systemPrompt: validated.systemPrompt,
        userPrompt: validated.userPrompt,
        binaryInputs: validated.binaryInputs,
        pageKey: validated.pageKey
      });

      return {
        text: result.text,
        usage: result.usage,
        connectionId: connection.id,
        model: model.name
      };
    },

    async listModels(connectionId) {
      const connection = getConnection(configStore, connectionId);
      if (connection.transportType !== 'openai_compatible') {
        throw new HttpError(400, 'MODELS_PROBE_UNSUPPORTED', '当前仅支持 OpenAI 兼容连接 Ping 模型。');
      }

      const baseUrl = stripTrailingSlash(connection.baseUrl).replace(/\/chat\/completions$/, '');
      const url = baseUrl.endsWith('/models') ? baseUrl : `${baseUrl}/models`;
      const startedAt = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${connection.apiKey}`
          },
          signal: controller.signal
        });
        const text = await response.text();
        if (!response.ok) {
          throw new HttpError(
            502,
            'UPSTREAM_MODELS_ERROR',
            `上游模型列表返回 ${response.status}，请检查连接地址和 Key。`,
            { upstreamStatus: response.status }
          );
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (_) {
          throw new HttpError(502, 'UPSTREAM_MODELS_INVALID', '上游模型列表不是合法 JSON。');
        }

        const rawList = Array.isArray(data)
          ? data
          : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []));
        const models = Array.from(new Set(
          rawList
            .map((item) => (typeof item === 'string' ? item : item?.id || item?.name))
            .map((item) => String(item || '').trim())
            .filter(Boolean)
        )).sort((left, right) => left.localeCompare(right));

        if (models.length === 0) {
          throw new HttpError(502, 'UPSTREAM_MODELS_EMPTY', '上游没有返回可用模型。');
        }

        logger.info?.('company_models_probe', {
          connectionId: connection.id,
          count: models.length,
          durationMs: now() - startedAt
        });
        return { models };
      } catch (error) {
        if (error instanceof HttpError) {
          throw error;
        }
        if (error?.name === 'AbortError') {
          throw new HttpError(504, 'UPSTREAM_MODELS_TIMEOUT', 'Ping 模型超时，请稍后重试。');
        }
        throw new HttpError(502, 'UPSTREAM_MODELS_UNREACHABLE', '无法连接上游模型列表，请检查连接地址和网络。');
      } finally {
        clearTimeout(timer);
      }
    },

    async testConnection(connectionId, modelName) {
      const connection = getConnection(configStore, connectionId);
      const model = modelName
        ? getModelForConnection(connection, modelName)
        : connection.models.find((item) => item.enabled);
      if (!model) {
        throw new HttpError(400, 'MODEL_NOT_ALLOWED', '该连接没有启用中的模型。');
      }

      const startedAt = now();
      const result = await callProvider({
        connection,
        model,
        systemPrompt: '你是连接测试助手。请只输出合法 JSON。',
        userPrompt: '请只返回 JSON：{"ok":true}',
        binaryInputs: [],
        pageKey: '',
        testMode: true
      });

      return {
        ok: true,
        connectionId: connection.id,
        model: model.name,
        latencyMs: now() - startedAt,
        textPreview: String(result.text || '').slice(0, 80),
        usage: result.usage
      };
    }
  };
}
