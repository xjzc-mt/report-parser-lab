import { ESG_EXPERT_SYSTEM_PROMPT, NOT_FOUND_VALUE, PRICING } from '../constants/extraction.js';
import { normalizeValueType } from '../utils/extraction.js';

function normalizePricingName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_.]+/g, '-');
}

function selectPricingTier(entry, inputTokens) {
  if (!entry || !Array.isArray(entry.tiers) || entry.tiers.length === 0) {
    return entry;
  }
  const tiers = [...entry.tiers].sort((left, right) => left.maxInputTokens - right.maxInputTokens);
  const selected = tiers.find((tier) => inputTokens <= tier.maxInputTokens) || tiers[tiers.length - 1];
  return { ...entry, ...selected, key: entry.key };
}

export function getModelPricing(modelName, inputTokens = 0) {
  const normalized = normalizePricingName(modelName);
  if (!normalized) {
    return null;
  }
  const candidates = Object.entries(PRICING)
    .filter(([key]) => key !== 'default')
    .map(([key, entry]) => ({ key, normalized: normalizePricingName(key), entry }))
    .sort((left, right) => right.normalized.length - left.normalized.length);

  const exact = candidates.find((candidate) => candidate.normalized === normalized);
  if (exact) {
    return selectPricingTier({ key: exact.key, ...exact.entry }, Number(inputTokens) || 0);
  }
  const partial = candidates.find((candidate) => normalized.includes(candidate.normalized));
  return partial
    ? selectPricingTier({ key: partial.key, ...partial.entry }, Number(inputTokens) || 0)
    : null;
}

export function isPricingConfigured(modelName) {
  return Boolean(getModelPricing(modelName));
}

export function estimateCost(modelName, inputTokens, outputTokens) {
  const pricing = getModelPricing(modelName, inputTokens) || PRICING.default;
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

/** 判断是否为 Gemini provider */
function isGeminiProvider(providerType, apiUrl) {
  if (providerType) return providerType === 'gemini';
  return (apiUrl || '').includes('googleapis.com');
}

/** 判断是否为 Anthropic provider */
function isAnthropicProvider(providerType, apiUrl) {
  if (providerType) return providerType === 'anthropic';
  return (apiUrl || '').includes('anthropic.com');
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRequestOptions(requestOptions) {
  return isPlainObject(requestOptions) ? requestOptions : {};
}

function mergeGeminiRequestBody(baseBody, requestOptions) {
  const options = normalizeRequestOptions(requestOptions);
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

function mergeChatCompletionsRequestBody(baseBody, requestOptions) {
  const options = normalizeRequestOptions(requestOptions);
  const { extra_body: extraBody, ...restOptions } = options;
  const merged = {
    ...baseBody,
    ...restOptions,
    ...(isPlainObject(extraBody) ? extraBody : {})
  };

  return {
    ...merged,
    model: merged.model || baseBody.model,
    messages: Array.isArray(merged.messages) ? merged.messages : baseBody.messages
  };
}

async function callGemini({
  sysPrompt,
  userPrompt,
  apiUrl,
  apiKey,
  modelName,
  pdfBase64,
  pdfInputs = null,
  requestOptions = {}
}) {
  let finalUrl = apiUrl;
  if (!finalUrl.endsWith('generateContent')) {
    finalUrl = `${apiUrl.replace(/\/$/, '')}/models/${modelName}:generateContent`;
  }
  const parts = [];
  const normalizedPdfInputs = Array.isArray(pdfInputs) && pdfInputs.length > 0
    ? pdfInputs
    : (pdfBase64 ? [{ mimeType: 'application/pdf', data: pdfBase64, label: '' }] : []);

  for (const input of normalizedPdfInputs) {
    if (input?.label) {
      parts.push({ text: String(input.label) });
    }
    if (input?.data) {
      parts.push({
        inline_data: {
          mime_type: input.mimeType || 'application/pdf',
          data: input.data
        }
      });
    }
  }
  parts.push({ text: userPrompt });
  const contents = [{ role: 'user', parts }];
  const requestBody = mergeGeminiRequestBody({
    system_instruction: { parts: [{ text: sysPrompt }] },
    contents,
    generationConfig: { response_mime_type: 'application/json', temperature: 0.1 }
  }, requestOptions);
  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
  }
  const data = await response.json();
  const usage = { input_tokens: 0, output_tokens: 0 };
  if (data.usageMetadata) {
    usage.input_tokens = data.usageMetadata.promptTokenCount || 0;
    usage.output_tokens = data.usageMetadata.candidatesTokenCount || 0;
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Unexpected Gemini API response structure');
  return { text, usage };
}

async function callAnthropic({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, requestOptions = {} }) {
  const { Anthropic } = await import('@anthropic-ai/sdk');
  const clientOptions = { apiKey, dangerouslyAllowBrowser: true };
  if (apiUrl) {
    clientOptions.baseURL = apiUrl.replace(/\/$/, '');
  }
  const client = new Anthropic(clientOptions);
  const messageRequest = mergeChatCompletionsRequestBody({
    model: modelName,
    max_tokens: 8192,
    temperature: 0.1,
    system: sysPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  }, requestOptions);
  const message = await client.messages.create(messageRequest);
  const usage = {
    input_tokens: message.usage?.input_tokens || 0,
    output_tokens: message.usage?.output_tokens || 0
  };
  const text = message.content?.[0]?.text || '';
  return { text, usage };
}

function buildOpenAIUserContent(userPrompt, pdfBase64, pdfInputs) {
  const inputs = Array.isArray(pdfInputs) && pdfInputs.length > 0
    ? pdfInputs
    : (pdfBase64 ? [{ mimeType: 'application/pdf', data: pdfBase64, label: '' }] : []);
  if (inputs.length === 0) {
    return userPrompt;
  }

  const content = [{ type: 'text', text: userPrompt }];
  for (const input of inputs) {
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

async function callOpenAI({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64 = null, pdfInputs = null, requestOptions = {} }) {
  let finalUrl = apiUrl;
  if (!finalUrl.includes('/chat/completions')) {
    finalUrl = `${apiUrl.replace(/\/$/, '')}/chat/completions`;
  }
  const requestBody = mergeChatCompletionsRequestBody({
    model: modelName,
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: buildOpenAIUserContent(userPrompt, pdfBase64, pdfInputs) }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  }, requestOptions);
  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
  }
  const data = await response.json();
  const usage = { input_tokens: 0, output_tokens: 0 };
  if (data.usage) {
    usage.input_tokens = data.usage.prompt_tokens || 0;
    usage.output_tokens = data.usage.completion_tokens || 0;
  }
  return { text: data.choices?.[0]?.message?.content || '', usage };
}

function isCompanyProvider(providerType, serverManaged) {
  return serverManaged === true || providerType === 'company';
}

async function callCompanyProxy({
  sysPrompt,
  userPrompt,
  companyConnectionId,
  modelName,
  pageKey,
  runId,
  pdfBase64 = null,
  pdfInputs = null,
  fetchImpl = globalThis.fetch
}) {
  if (!companyConnectionId) {
    throw new Error('公司模型连接缺失，请重新选择模型预设。');
  }
  if (!runId) {
    throw new Error('公司模型运行授权缺失，请重新启动任务。');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境无法调用公司模型服务。');
  }

  const payload = {
    connectionId: companyConnectionId,
    model: modelName,
    pageKey: pageKey || '',
    runId,
    systemPrompt: sysPrompt,
    userPrompt
  };
  if (pdfBase64) {
    payload.pdfBase64 = pdfBase64;
  } else if (Array.isArray(pdfInputs) && pdfInputs.length > 0) {
    payload.pdfInputs = pdfInputs.map((item) => ({
      mimeType: item?.mimeType || 'application/pdf',
      data: item?.data || '',
      label: item?.label || ''
    }));
  }

  const response = await fetchImpl('/api/llm/company', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-LLM-Lab-Client': 'web'
    },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || `公司模型服务返回 HTTP ${response.status}`;
    throw new Error(`公司模型服务错误：${message}`);
  }
  if (!data || typeof data.text !== 'string') {
    throw new Error('公司模型服务返回了无法识别的结果。');
  }

  return {
    text: data.text,
    usage: {
      input_tokens: Number(data.usage?.input_tokens || 0),
      output_tokens: Number(data.usage?.output_tokens || 0)
    }
  };
}

export async function callLLM({
  sysPrompt,
  userPrompt,
  apiUrl,
  apiKey,
  modelName,
  pdfBase64 = null,
  pdfInputs = null,
  providerType = null,
  requestOptions = {},
  serverManaged = false,
  companyConnectionId = '',
  pageKey = '',
  runId = ''
}) {
  if (isCompanyProvider(providerType, serverManaged)) {
    return callCompanyProxy({
      sysPrompt,
      userPrompt,
      companyConnectionId,
      modelName,
      pageKey,
      runId,
      pdfBase64,
      pdfInputs
    });
  }
  if (isAnthropicProvider(providerType, apiUrl)) {
    return callAnthropic({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, requestOptions });
  }
  if (isGeminiProvider(providerType, apiUrl)) {
    return callGemini({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64, pdfInputs, requestOptions });
  }
  return callOpenAI({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64, pdfInputs, requestOptions });
}


export function usesPdfDirectInput(llmSettings = {}) {
  if (llmSettings.serverManaged) {
    return Boolean(llmSettings.supportsPdfUpload);
  }
  const providerType = String(llmSettings.providerType || '').trim();
  if (llmSettings.supportsPdfUpload) {
    return true;
  }
  if (providerType === 'gemini') {
    return true;
  }
  if (providerType) {
    return false;
  }
  return String(llmSettings.apiUrl || '').includes('googleapis.com');
}

function createAbortError() {
  const error = new Error('操作已取消');
  error.name = 'AbortError';
  return error;
}

function waitWithSignal(ms, signal) {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener?.('abort', onAbort);
      reject(createAbortError());
    };
    signal.addEventListener?.('abort', onAbort, { once: true });
  });
}

export async function callLLMWithRetry(params, onProgress, maxRetries = 3, signal = params?.signal) {
  const attempts = Math.min(10, Math.max(1, Math.round(Number(maxRetries) || 3)));
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    try {
      return await callLLM(params);
    } catch (error) {
      lastError = error;
      if (signal?.aborted || error?.name === 'AbortError') {
        throw createAbortError();
      }
      if (attempt < attempts - 1) {
        const waitSec = (attempt + 1) * 3;
        onProgress?.(`API 调用失败（第 ${attempt + 1}/${attempts} 次）：${error.message}，${waitSec} 秒后重试...`);
        await waitWithSignal(waitSec * 1000, signal);
      }
    }
  }
  throw lastError;
}

export function buildExtractionSystemPrompt({ isGemini, batchType }) {
  const normalizedBatchType = normalizeValueType(batchType);
  const isTextBatch = normalizedBatchType === '文字型';
  const pageRule = isGemini
    ? '- "pdf_numbers" MUST be the physical PDF page number(s) as they appear in the original document (the page numbers the user sees when reading). Return the ACTUAL page number from the original report, not the position within the extracted subset.'
    : '- "pdf_numbers" refers to the page numbers as shown in the original document content (the numbers printed on the pages or shown in the table of contents), NOT the position within any extracted subset.';

  let fieldRule = '- Extract the text and put it in "text_value".';
  let schema = `{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "text_value": "extracted text. Output '${NOT_FOUND_VALUE}' if not found.",
      "pdf_numbers": "actual page number(s) from the original report. Output '${NOT_FOUND_VALUE}' if not found."
    }
  ]
}`;

  if (normalizedBatchType === '数值型') {
    fieldRule = '- Extract the number in "num_value" and the unit in "unit".';
    schema = `{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "num_value": "extracted number. Output '${NOT_FOUND_VALUE}' if not found.",
      "unit": "unit of the value (e.g. %, tonnes, MWh). Output '${NOT_FOUND_VALUE}' if not found.",
      "pdf_numbers": "actual page number(s) from the original report. Output '${NOT_FOUND_VALUE}' if not found."
    }
  ]
}`;
  } else if (normalizedBatchType === '货币型') {
    fieldRule = '- Extract the number in "num_value", the reporting unit in "unit", and the currency in "currency".';
    schema = `{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "num_value": "extracted number. Output '${NOT_FOUND_VALUE}' if not found.",
      "unit": "reporting unit such as million/billion if present. Output '${NOT_FOUND_VALUE}' if not found.",
      "currency": "currency code or symbol from the document. Output '${NOT_FOUND_VALUE}' if not found.",
      "pdf_numbers": "actual page number(s) from the original report. Output '${NOT_FOUND_VALUE}' if not found."
    }
  ]
}`;
  } else if (normalizedBatchType === '强度型') {
    fieldRule = '- Extract the number in "num_value", and separately extract "numerator_unit" and "denominator_unit". If a combined unit is clearly shown, also put it in "unit".';
    schema = `{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "num_value": "extracted number. Output '${NOT_FOUND_VALUE}' if not found.",
      "unit": "combined unit if explicitly shown. Output '${NOT_FOUND_VALUE}' if not found.",
      "numerator_unit": "unit in the numerator. Output '${NOT_FOUND_VALUE}' if not found.",
      "denominator_unit": "unit in the denominator. Output '${NOT_FOUND_VALUE}' if not found.",
      "pdf_numbers": "actual page number(s) from the original report. Output '${NOT_FOUND_VALUE}' if not found."
    }
  ]
}`;
  }

  return `${ESG_EXPERT_SYSTEM_PROMPT}

## Task Instructions
You are extracting ${isTextBatch ? 'TEXT' : normalizedBatchType} ESG requirements from the provided report.

IMPORTANT RULES:
${pageRule}
- If an indicator has values for MULTIPLE YEARS, return SEPARATE entries for each year with the "year" field filled.
${fieldRule}
- For each indicator, strictly follow its "Prompt" field as an additional extraction instruction.
- For this application, if an indicator is not found, output "${NOT_FOUND_VALUE}".

Output STRICTLY in JSON format:
${schema}`;
}

export function getStandardSystemPromptForValueType(valueType, { isGemini = false } = {}) {
  return buildExtractionSystemPrompt({ isGemini, batchType: valueType });
}

export function isSystemPromptCompleteForType(systemPrompt, valueType) {
  const text = String(systemPrompt || '').trim();
  if (!text) {
    return false;
  }
  const normalizedType = normalizeValueType(valueType);
  if (!normalizedType) {
    return true;
  }

  const hasJsonContract = text.includes('"results"') || text.includes('Output STRICTLY in JSON format');
  if (!hasJsonContract) {
    return false;
  }

  if (normalizedType === '文字型') {
    return text.includes('text_value');
  }
  if (normalizedType === '数值型') {
    return text.includes('num_value') && text.includes('unit');
  }
  if (normalizedType === '货币型') {
    return text.includes('num_value') && text.includes('currency');
  }
  if (normalizedType === '强度型') {
    return text.includes('num_value') && (text.includes('numerator_unit') || text.includes('denominator_unit'));
  }
  return true;
}

export function buildCompletedSystemPrompt(existingPrompt, valueType, { isGemini = false } = {}) {
  const normalizedType = normalizeValueType(valueType);
  if (!normalizedType) {
    return existingPrompt || '';
  }
  const text = String(existingPrompt || '').trim();
  const standard = buildExtractionSystemPrompt({ isGemini, batchType: normalizedType });

  if (!text || text === ESG_EXPERT_SYSTEM_PROMPT.trim()) {
    return standard;
  }

  if (isSystemPromptCompleteForType(text, normalizedType)) {
    return text;
  }

  const taskInstructionsIndex = standard.indexOf('## Task Instructions');
  const taskInstructionsPart = taskInstructionsIndex >= 0 ? standard.slice(taskInstructionsIndex) : standard;
  return `${text}\n\n${taskInstructionsPart}`;
}

export function isStandardSystemPrompt(systemPrompt) {
  const text = String(systemPrompt || '').trim();
  if (!text) return true;
  for (const type of ['文字型', '数值型', '货币型', '强度型']) {
    if (
      text === buildExtractionSystemPrompt({ isGemini: false, batchType: type }).trim() ||
      text === buildExtractionSystemPrompt({ isGemini: true, batchType: type }).trim()
    ) {
      return true;
    }
  }
  return false;
}

export { ESG_EXPERT_SYSTEM_PROMPT };
