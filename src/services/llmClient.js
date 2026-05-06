import { ESG_EXPERT_SYSTEM_PROMPT, NOT_FOUND_VALUE, PRICING } from '../constants/extraction.js';
import { normalizeValueType } from '../utils/extraction.js';

export function estimateCost(modelName, inputTokens, outputTokens) {
  const key = Object.keys(PRICING).find((candidate) => modelName.includes(candidate)) || 'default';
  const pricing = PRICING[key];
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

async function callOpenAI({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, requestOptions = {} }) {
  let finalUrl = apiUrl;
  if (!finalUrl.includes('/chat/completions')) {
    finalUrl = `${apiUrl.replace(/\/$/, '')}/chat/completions`;
  }
  const requestBody = mergeChatCompletionsRequestBody({
    model: modelName,
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt }
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

export async function callLLM({
  sysPrompt,
  userPrompt,
  apiUrl,
  apiKey,
  modelName,
  pdfBase64 = null,
  pdfInputs = null,
  providerType = null,
  requestOptions = {}
}) {
  if (isAnthropicProvider(providerType, apiUrl)) {
    return callAnthropic({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, requestOptions });
  }
  if (isGeminiProvider(providerType, apiUrl)) {
    return callGemini({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64, pdfInputs, requestOptions });
  }
  return callOpenAI({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, requestOptions });
}

export async function callLLMWithRetry(params, onProgress, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await callLLM(params);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const waitSec = (attempt + 1) * 3;
        onProgress?.(`API 调用失败（第 ${attempt + 1}/${maxRetries} 次）：${error.message}，${waitSec} 秒后重试...`);
        await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
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

export { ESG_EXPERT_SYSTEM_PROMPT };
