import {
  extractJsonCandidate,
  parsePromptIterationPageSpec,
  summarizeParsedJson
} from '../utils/promptIterationModel.js';
import { callLLMWithRetry } from './llmClient.js';
import { extractPdfPages, uint8ArrayToBase64 } from './pdfPageExtractor.js';

async function defaultFileToBase64(file, toBase64) {
  const arrayBuffer = await file.arrayBuffer();
  return toBase64(new Uint8Array(arrayBuffer));
}

export const PROMPT_ITERATION_PROVIDER_ERROR = 'Prompt 快速迭代当前仅支持 Gemini PDF 直传，请切换到 Gemini Provider 后再运行。';

export function supportsPromptIterationPdfProvider(llmSettings) {
  const providerType = String(llmSettings?.providerType || '').trim();
  if (providerType) {
    return providerType === 'gemini';
  }

  return String(llmSettings?.apiUrl || '').includes('googleapis.com');
}

export function normalizePromptIterationDraft(raw) {
  const draft = raw && typeof raw === 'object' ? raw : {};

  return {
    name: String(draft.name || ''),
    systemPrompt: String(draft.systemPrompt || ''),
    userPrompt: String(draft.userPrompt || ''),
    promptAssetId: String(draft.promptAssetId || ''),
    promptVersionId: String(draft.promptVersionId || ''),
    promptIndicatorCode: String(draft.promptIndicatorCode || ''),
    files: Array.isArray(draft.files)
      ? draft.files.map((item) => ({
          id: String(item?.id || ''),
          name: String(item?.name || ''),
          type: String(item?.type || 'application/pdf'),
          pageSpec: String(item?.pageSpec || '')
        }))
      : []
  };
}

export function clipPromptIterationHistory(history, limit = 20) {
  return Array.isArray(history) ? history.slice(0, limit) : [];
}

export function removePromptIterationHistoryAt(history, index) {
  const list = Array.isArray(history) ? history : [];
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= list.length) {
    return [...list];
  }
  return list.filter((_, itemIndex) => itemIndex !== numericIndex);
}

export async function runPromptIteration(input, deps = {}) {
  const {
    callLLMWithRetry: call = callLLMWithRetry,
    extractPdfPages: extractPages = extractPdfPages,
    uint8ArrayToBase64: toBase64 = uint8ArrayToBase64,
    fileToBase64 = (file) => defaultFileToBase64(file, toBase64),
    now = () => Date.now()
  } = deps;

  if (!supportsPromptIterationPdfProvider(input?.llmSettings)) {
    throw new Error(PROMPT_ITERATION_PROVIDER_ERROR);
  }

  const results = [];
  const files = Array.isArray(input?.files) ? input.files : [];
  const totalFiles = files.length || 1;
  const reportProgress = (message, percentage = -1, extra = {}) => {
    input?.onProgress?.({
      message,
      percentage,
      timestamp: new Date().toLocaleTimeString(),
      ...extra
    });
  };
  const reportFileProgress = (fileIndex, fileName, message, localPercentage = -1) => {
    const percentage = localPercentage >= 0
      ? Math.min(99, Math.round(((fileIndex + (localPercentage / 100)) / totalFiles) * 100))
      : -1;
    reportProgress(`[${fileIndex + 1}/${files.length}] ${fileName || '未命名 PDF'}：${message}`, percentage, {
      fileIndex,
      fileName
    });
  };

  reportProgress('开始 Prompt 快速验证...', 0);

  for (const [fileIndex, item] of files.entries()) {
    const startedAt = now();
    const file = item?.file;
    const fileName = typeof file?.name === 'string' && file.name.trim() ? file.name : (item?.name || '');

    reportFileProgress(fileIndex, fileName, '开始处理', 4);

    if (!file || !fileName) {
      reportFileProgress(fileIndex, fileName, '缺少 PDF 文件或文件名', 100);
      results.push({
        fileId: item?.id,
        fileName,
        pageSpec: item?.pageSpec || '',
        resolvedPages: [],
        scopeLabel: '文件错误',
        status: 'error',
        errorMessage: '缺少 PDF 文件或文件名',
        rawResponse: '',
        parsedJson: null,
        jsonParseStatus: 'not_found',
        summaryText: '文件错误',
        usage: { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
      continue;
    }

    const parsedPageSpec = parsePromptIterationPageSpec(item.pageSpec);

    if (!parsedPageSpec.valid) {
      reportFileProgress(fileIndex, fileName, `页码错误：${parsedPageSpec.error}`, 100);
      results.push({
        fileId: item.id,
        fileName,
        pageSpec: item.pageSpec,
        resolvedPages: [],
        scopeLabel: '页码错误',
        status: 'error',
        errorMessage: parsedPageSpec.error,
        rawResponse: '',
        parsedJson: null,
        jsonParseStatus: 'not_found',
        summaryText: '页码错误',
        usage: { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
      continue;
    }

    try {
      let pdfBase64 = await fileToBase64(file);
      let resolvedPages = [];
      let scopeLabel = '全文';
      reportFileProgress(fileIndex, fileName, '正在载入全文 PDF', 18);

      if (parsedPageSpec.pages.length > 0) {
        reportFileProgress(fileIndex, fileName, `正在截取页码：${parsedPageSpec.normalized}`, 24);
        const extracted = await extractPages(file, parsedPageSpec.pages, fileName);
        pdfBase64 = toBase64(extracted.pdfData);
        resolvedPages = parsedPageSpec.pages;
        scopeLabel = `指定页：${parsedPageSpec.normalized}`;
      }

      reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
      const targetName = String(input.name || '').trim();
      const response = await call({
        sysPrompt: input.systemPrompt,
        userPrompt: targetName ? `${input.userPrompt}\n\n提取目标：${targetName}` : input.userPrompt,
        apiUrl: input.llmSettings.apiUrl,
        apiKey: input.llmSettings.apiKey,
        modelName: input.llmSettings.modelName,
        providerType: input.llmSettings.providerType,
        requestOptions: input.llmSettings.requestOptions,
        pdfBase64
      }, (message) => reportFileProgress(fileIndex, fileName, message, -1));

      reportFileProgress(fileIndex, fileName, '正在解析模型回复', 88);
      const parsed = extractJsonCandidate(response.text);
      results.push({
        fileId: item.id,
        fileName,
        pageSpec: item.pageSpec,
        resolvedPages,
        scopeLabel,
        status: 'success',
        errorMessage: '',
        rawResponse: response.text,
        parsedJson: parsed.parsed,
        jsonParseStatus: parsed.status,
        summaryText: parsed.status === 'success' ? summarizeParsedJson(parsed.parsed) : '未解析出 JSON',
        usage: response.usage || { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
      reportFileProgress(fileIndex, fileName, '处理完成', 100);
    } catch (error) {
      reportFileProgress(fileIndex, fileName, `运行失败：${error instanceof Error ? error.message : String(error)}`, 100);
      results.push({
        fileId: item.id,
        fileName,
        pageSpec: item.pageSpec,
        resolvedPages: parsedPageSpec.pages,
        scopeLabel: parsedPageSpec.pages.length > 0 ? `指定页：${parsedPageSpec.normalized}` : '全文',
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        rawResponse: '',
        parsedJson: null,
        jsonParseStatus: 'not_found',
        summaryText: '运行失败',
        usage: { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
    }
  }

  const run = {
    createdAt: now(),
    name: input.name,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    modelName: input.llmSettings.modelName,
    providerType: input.llmSettings.providerType,
    results,
    summary: {
      total: results.length,
      successCount: results.filter((item) => item.status === 'success').length,
      errorCount: results.filter((item) => item.status === 'error').length
    }
  };

  reportProgress(`Prompt 快速验证完成：成功 ${run.summary.successCount}/${run.summary.total}`, 100);
  return run;
}
