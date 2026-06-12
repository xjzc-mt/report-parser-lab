import {
  detectPromptIterationFileKind,
  extractJsonCandidate,
  parsePromptIterationPageSpec,
  summarizeParsedJson
} from '../utils/promptIterationModel.js';
import { callLLMWithRetry } from './llmClient.js';
import { parseDocx, parseExcel } from './fileParsers.js';
import { extractPdfPages, uint8ArrayToBase64 } from './pdfPageExtractor.js';

async function defaultFileToBase64(file, toBase64) {
  const arrayBuffer = await file.arrayBuffer();
  return toBase64(new Uint8Array(arrayBuffer));
}

async function defaultReadTextFile(file) {
  if (typeof file?.text === 'function') {
    return file.text();
  }

  const arrayBuffer = await file.arrayBuffer();
  return new TextDecoder('utf-8').decode(arrayBuffer);
}

export const PROMPT_ITERATION_PROVIDER_ERROR = 'Prompt 快速迭代当前仅支持 Gemini PDF 直传，请切换到 Gemini Provider 后再运行。';

function buildTextPrompt(userPrompt, targetName, fileName, content, sourceLabel) {
  const segments = [String(userPrompt || '').trim()];

  if (targetName) {
    segments.push(`提取目标：${targetName}`);
  }

  segments.push(`输入类型：${sourceLabel}`);
  if (fileName) {
    segments.push(`文件名：${fileName}`);
  }
  segments.push('输入内容如下：');
  segments.push(String(content || '').trim());

  return segments.filter(Boolean).join('\n\n');
}

function formatCellValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }
  return String(value);
}

function stringifySpreadsheetRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return '表格为空。';
  }

  return list.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return `第 ${index + 1} 行：${formatCellValue(row)}`;
    }

    const line = Object.entries(row)
      .map(([key, value]) => `${key}: ${formatCellValue(value)}`)
      .join(' | ');
    return `第 ${index + 1} 行：${line}`;
  }).join('\n');
}

function resolvePromptIterationFileKind(item, fallbackInputSource = '') {
  const detected = detectPromptIterationFileKind(item);
  if (detected !== 'unsupported') {
    return detected;
  }

  const normalized = String(fallbackInputSource || '').trim().toLowerCase();
  if (normalized === 'spreadsheet' || normalized === 'text' || normalized === 'pdf') {
    return normalized;
  }
  return 'unsupported';
}

export function supportsPromptIterationPdfProvider(llmSettings) {
  const providerType = String(llmSettings?.providerType || '').trim();
  if (providerType) {
    return providerType === 'gemini';
  }

  return String(llmSettings?.apiUrl || '').includes('googleapis.com');
}

export function normalizePromptIterationDraft(raw, options = {}) {
  const draft = raw && typeof raw === 'object' ? raw : {};
  const preserveFiles = Boolean(options?.preserveFiles);

  return {
    inputSource: String(draft.inputSource || 'pdf'),
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
          pageSpec: String(item?.pageSpec || ''),
          ...(preserveFiles ? { file: item?.file || null } : {})
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
    readTextFile = defaultReadTextFile,
    parseSpreadsheetFile = parseExcel,
    parseDocxFile = parseDocx,
    now = () => Date.now()
  } = deps;
  const files = Array.isArray(input?.files) ? input.files : [];
  const fallbackInputSource = String(input?.inputSource || 'pdf').trim().toLowerCase();
  const hasBinaryMultimodalFiles = files.some((item) => ['pdf', 'image'].includes(resolvePromptIterationFileKind(item, fallbackInputSource)));

  if (hasBinaryMultimodalFiles && !supportsPromptIterationPdfProvider(input?.llmSettings)) {
    throw new Error(PROMPT_ITERATION_PROVIDER_ERROR);
  }

  const results = [];
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
    reportProgress(`[${fileIndex + 1}/${files.length}] ${fileName || '未命名文件'}：${message}`, percentage, {
      fileIndex,
      fileName
    });
  };

  reportProgress('开始 Prompt 快速验证...', 0);

  for (const [fileIndex, item] of files.entries()) {
    const startedAt = now();
    const file = item?.file;
    const fileName = typeof file?.name === 'string' && file.name.trim() ? file.name : (item?.name || '');
    const fileKind = resolvePromptIterationFileKind(item, fallbackInputSource);
    const missingFileMessage = fileKind === 'pdf' ? '缺少 PDF 文件或文件名' : '缺少输入文件或文件名';

    reportFileProgress(fileIndex, fileName, '开始处理', 4);

    if (!file || !fileName) {
      reportFileProgress(fileIndex, fileName, missingFileMessage, 100);
      results.push({
        fileId: item?.id,
        fileName,
        pageSpec: item?.pageSpec || '',
        resolvedPages: [],
        scopeLabel: '文件错误',
        status: 'error',
        errorMessage: missingFileMessage,
        rawResponse: '',
        parsedJson: null,
        jsonParseStatus: 'not_found',
        summaryText: '文件错误',
        usage: { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
      continue;
    }

    const parsedPageSpec = fileKind === 'pdf'
      ? parsePromptIterationPageSpec(item.pageSpec)
      : { valid: true, pages: [], normalized: '', error: '' };

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
      const targetName = String(input.name || '').trim();
      let resolvedPages = [];
      let scopeLabel = '全文';
      let response;

      if (fileKind === 'pdf') {
        let pdfBase64 = await fileToBase64(file);
        reportFileProgress(fileIndex, fileName, '正在载入全文 PDF', 18);

        if (parsedPageSpec.pages.length > 0) {
          reportFileProgress(fileIndex, fileName, `正在截取页码：${parsedPageSpec.normalized}`, 24);
          const extracted = await extractPages(file, parsedPageSpec.pages, fileName);
          pdfBase64 = toBase64(extracted.pdfData);
          resolvedPages = parsedPageSpec.pages;
          scopeLabel = `指定页：${parsedPageSpec.normalized}`;
        }

        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: input.systemPrompt,
          userPrompt: targetName ? `${input.userPrompt}\n\n提取目标：${targetName}` : input.userPrompt,
          apiUrl: input.llmSettings.apiUrl,
          apiKey: input.llmSettings.apiKey,
          modelName: input.llmSettings.modelName,
          providerType: input.llmSettings.providerType,
          requestOptions: input.llmSettings.requestOptions,
          pdfBase64
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1));
      } else if (fileKind === 'image') {
        reportFileProgress(fileIndex, fileName, '正在载入图片', 18);
        const imageBase64 = await fileToBase64(file);
        scopeLabel = '图片';
        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: input.systemPrompt,
          userPrompt: targetName ? `${input.userPrompt}\n\n提取目标：${targetName}` : input.userPrompt,
          apiUrl: input.llmSettings.apiUrl,
          apiKey: input.llmSettings.apiKey,
          modelName: input.llmSettings.modelName,
          providerType: input.llmSettings.providerType,
          requestOptions: input.llmSettings.requestOptions,
          pdfInputs: [{
            mimeType: file.type || 'image/png',
            data: imageBase64,
            label: fileName ? `输入图片：${fileName}` : '输入图片'
          }]
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1));
      } else if (fileKind === 'spreadsheet') {
        reportFileProgress(fileIndex, fileName, '正在读取表格内容', 18);
        const rows = await parseSpreadsheetFile(file);
        const content = stringifySpreadsheetRows(rows);
        scopeLabel = '整表';
        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: input.systemPrompt,
          userPrompt: buildTextPrompt(input.userPrompt, targetName, fileName, content, '表格'),
          apiUrl: input.llmSettings.apiUrl,
          apiKey: input.llmSettings.apiKey,
          modelName: input.llmSettings.modelName,
          providerType: input.llmSettings.providerType,
          requestOptions: input.llmSettings.requestOptions
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1));
      } else if (fileKind === 'text' && String(file?.name || '').toLowerCase().endsWith('.docx')) {
        reportFileProgress(fileIndex, fileName, '正在解析 DOCX 内容', 18);
        const content = await parseDocxFile(file);
        scopeLabel = '全文文本';
        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: input.systemPrompt,
          userPrompt: buildTextPrompt(input.userPrompt, targetName, fileName, content, 'DOCX 文档'),
          apiUrl: input.llmSettings.apiUrl,
          apiKey: input.llmSettings.apiKey,
          modelName: input.llmSettings.modelName,
          providerType: input.llmSettings.providerType,
          requestOptions: input.llmSettings.requestOptions
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1));
      } else if (fileKind === 'text') {
        reportFileProgress(fileIndex, fileName, '正在读取文本内容', 18);
        const content = await readTextFile(file);
        scopeLabel = '全文文本';
        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: input.systemPrompt,
          userPrompt: buildTextPrompt(input.userPrompt, targetName, fileName, content, '文本'),
          apiUrl: input.llmSettings.apiUrl,
          apiKey: input.llmSettings.apiKey,
          modelName: input.llmSettings.modelName,
          providerType: input.llmSettings.providerType,
          requestOptions: input.llmSettings.requestOptions
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1));
      } else {
        throw new Error('暂不支持该文件类型，请上传 PDF、Excel/CSV 或常见文本文件。');
      }

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
    inputSource: hasBinaryMultimodalFiles
      ? (files.some((item) => resolvePromptIterationFileKind(item, fallbackInputSource) === 'pdf') ? 'pdf' : 'image')
      : (files.some((item) => resolvePromptIterationFileKind(item, fallbackInputSource) === 'spreadsheet') ? 'spreadsheet' : 'text'),
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
