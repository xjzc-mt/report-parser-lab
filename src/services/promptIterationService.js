import {
  buildCandidateIndicators,
  detectPromptIterationFileKind,
  extractJsonCandidate,
  normalizeIterationParsedJson,
  parsePromptIterationPageSpec,
  summarizeParsedJson
} from '../utils/promptIterationModel.js';
import {
  buildCompletedSystemPrompt,
  callLLMWithRetry,
  isSystemPromptCompleteForType,
  usesPdfDirectInput
} from './llmClient.js';
import { parseDocx, parseExcel, parsePDF } from './fileParsers.js';
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

export const PROMPT_ITERATION_PROVIDER_ERROR = '当前文件包含图片，图片输入需要模型支持多模态直传；PDF 会自动提取文本，不需要 PDF 直传。';

function buildLlmCallOptions(llmSettings = {}) {
  return {
    apiUrl: llmSettings.apiUrl,
    apiKey: llmSettings.apiKey,
    modelName: llmSettings.modelName,
    providerType: llmSettings.providerType,
    serverManaged: llmSettings.serverManaged,
    companyConnectionId: llmSettings.companyConnectionId,
    pageKey: llmSettings.pageKey,
    runId: llmSettings.runId,
    supportsPdfUpload: llmSettings.supportsPdfUpload,
    requestOptions: llmSettings.requestOptions
  };
}

function formatPromptIterationContext({ userPrompt = '', candidateIndicators = [], targetName = '' }) {
  const segments = [];

  if (candidateIndicators.length > 1) {
    // 多指标合批：专属指令仅在对应指标内出现，绝不置顶某个查看指标的 userPrompt，保证请求幂等与指标隔离
    segments.push(
      '【待提取指标清单 / Target Indicators】\n' +
      candidateIndicators.map((ind, idx) => {
        let line = `${idx + 1}. 指标代码：${ind.code || '未指定'} | 指标名称：${ind.name} | 指标类型：${ind.valueType || '通用'}`;
        if (ind.userPrompt) {
          line += `\n   提取指令与业务规则：${ind.userPrompt}`;
        }
        return line;
      }).join('\n\n')
    );
    segments.push(
      '【输出规范】\n请在最终输出的 JSON 中，针对每个指标输出提取结果，每条记录的 "indicator_code" 必须与上述指标代码严格一致，同时包含 "indicator_name" 对应指标名称。'
    );
  } else if (candidateIndicators.length === 1) {
    // 单指标运行：保持现有语义，将指标专属 userPrompt 放在最前
    if (userPrompt && userPrompt.trim()) {
      segments.push(String(userPrompt).trim());
    }
    const single = candidateIndicators[0];
    const name = single.name || targetName;
    const targetLines = [];
    if (name) {
      targetLines.push(`提取目标：${name}`);
    }
    if (single.code) {
      targetLines.push(`指标代码 (Indicator Code)：${single.code}`);
    }
    if (single.valueType) {
      targetLines.push(`指标类型 (Value Type)：${single.valueType}`);
    }
    if (targetLines.length > 0) {
      segments.push(targetLines.join('\n'));
    }
    if (single.code || name) {
      segments.push(
        '【输出规范】\n请在最终输出的 JSON 结果中：\n' +
        (single.code ? `- "indicator_code" 请填入 "${single.code}"\n` : '') +
        (name ? `- "indicator_name" 请填入 "${name}"\n` : '') +
        '若未在报告中找到对应数值，请在对应值项中填入"未披露"。'
      );
    }
  } else {
    if (userPrompt && userPrompt.trim()) {
      segments.push(String(userPrompt).trim());
    }
    if (targetName) {
      segments.push(`提取目标：${targetName}`);
    }
  }

  return segments.filter(Boolean).join('\n\n');
}

function buildTextPrompt(userPromptOrOptions, targetName, fileName, content, sourceLabel) {
  let context = '';
  let srcLabel = sourceLabel;
  let fName = fileName;
  let fileContent = content;

  if (userPromptOrOptions && typeof userPromptOrOptions === 'object') {
    const opts = userPromptOrOptions;
    context = formatPromptIterationContext({
      userPrompt: opts.userPrompt,
      candidateIndicators: opts.candidateIndicators || [],
      targetName: opts.targetName || ''
    });
    srcLabel = opts.sourceLabel || '';
    fName = opts.fileName || '';
    fileContent = opts.content || '';
  } else {
    context = formatPromptIterationContext({
      userPrompt: userPromptOrOptions,
      candidateIndicators: [],
      targetName: targetName || ''
    });
  }

  const segments = [context];
  if (srcLabel) {
    segments.push(`输入类型：${srcLabel}`);
  }
  if (fName) {
    segments.push(`文件名：${fName}`);
  }
  if (fileContent !== undefined && fileContent !== null && String(fileContent).trim() !== '') {
    segments.push('输入内容如下：');
    segments.push(String(fileContent || '').trim());
  }

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
  return usesPdfDirectInput(llmSettings);
}

export function normalizePromptIterationDraft(raw, options = {}) {
  const draft = raw && typeof raw === 'object' ? raw : {};
  const preserveFiles = Boolean(options?.preserveFiles);

  const selectedAssetIds = Array.isArray(draft.selectedPromptAssetIds)
    ? draft.selectedPromptAssetIds.map(String).filter(Boolean)
    : (draft.promptAssetId ? [String(draft.promptAssetId)] : []);

  return {
    inputSource: String(draft.inputSource || 'pdf'),
    name: String(draft.name || ''),
    systemPrompt: String(draft.systemPrompt || ''),
    userPrompt: String(draft.userPrompt || ''),
    promptAssetId: String(draft.promptAssetId || (selectedAssetIds[0] || '')),
    promptVersionId: String(draft.promptVersionId || ''),
    promptIndicatorCode: String(draft.promptIndicatorCode || ''),
    promptValueType: String(draft.promptValueType || draft.valueType || ''),
    selectedPromptAssetIds: selectedAssetIds.slice(0, 20),
    activeAssetId: String(draft.activeAssetId || draft.promptAssetId || (selectedAssetIds[0] || '')),
    indicatorPrompts: (draft.indicatorPrompts && typeof draft.indicatorPrompts === 'object') ? draft.indicatorPrompts : {},
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
    parsePdfFile = parsePDF,
    readTextFile = defaultReadTextFile,
    parseSpreadsheetFile = parseExcel,
    parseDocxFile = parseDocx,
    now = () => Date.now()
  } = deps;
  const files = Array.isArray(input?.files) ? input.files : [];
  const signal = input?.signal;
  const throwIfAborted = () => {
    if (signal?.aborted) {
      const error = new Error('Prompt 快速迭代已取消');
      error.name = 'AbortError';
      throw error;
    }
  };
  throwIfAborted();
  const candidateIndicators = buildCandidateIndicators(input);
  const fallbackInputSource = String(input?.inputSource || 'pdf').trim().toLowerCase();
  const hasPdfFiles = files.some((item) => resolvePromptIterationFileKind(item, fallbackInputSource) === 'pdf');
  const hasImageFiles = files.some((item) => resolvePromptIterationFileKind(item, fallbackInputSource) === 'image');
  const hasBinaryMultimodalFiles = hasPdfFiles || hasImageFiles;
  const supportsPdfDirect = supportsPromptIterationPdfProvider(input?.llmSettings);
  const usesPdfTextFallback = hasPdfFiles && !supportsPdfDirect;

  const valueType = String(input?.promptValueType || input?.valueType || '').trim();
  let effectiveSysPrompt = String(input?.systemPrompt || '');
  if (valueType && !isSystemPromptCompleteForType(effectiveSysPrompt, valueType)) {
    effectiveSysPrompt = buildCompletedSystemPrompt(effectiveSysPrompt, valueType, { isGemini: supportsPdfDirect });
  }

  if (hasImageFiles && !supportsPdfDirect) {
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

  const extractPdfTextContent = async (file, parsedPageSpec) => {
    const allPages = await parsePdfFile(file);
    const selectedPages = parsedPageSpec.pages.length > 0
      ? allPages.filter((page) => parsedPageSpec.pages.includes(page.pageNumber))
      : allPages;
    const content = selectedPages
      .map((page) => `--- 第 ${page.pageNumber} 页 ---\n${page.text || ''}`)
      .join('\n\n')
      .trim();
    return {
      content,
      resolvedPages: parsedPageSpec.pages.length > 0
        ? selectedPages.map((page) => page.pageNumber)
        : [],
      scopeLabel: parsedPageSpec.pages.length > 0
        ? `指定页文本：${parsedPageSpec.normalized}`
        : '全文文本'
    };
  };

  reportProgress('开始 Prompt 快速验证...', 0);

  for (const [fileIndex, item] of files.entries()) {
    throwIfAborted();
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
      const directMultimodalPrompt = formatPromptIterationContext({
        userPrompt: input.userPrompt,
        candidateIndicators,
        targetName
      });
      let resolvedPages = [];
      let scopeLabel = '全文';
      let response;

      if (fileKind === 'pdf' && usesPdfTextFallback) {
        reportFileProgress(fileIndex, fileName, '当前模型不支持 PDF 直传，正在提取 PDF 文本', 18);
        const fallback = await extractPdfTextContent(file, parsedPageSpec);
        if (!fallback.content) {
          throw new Error('PDF 未提取到可发送的文本；如果这是扫描件，请改用支持 PDF 直传的模型。');
        }
        resolvedPages = fallback.resolvedPages;
        scopeLabel = fallback.scopeLabel;

        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: effectiveSysPrompt,
          userPrompt: buildTextPrompt({
            userPrompt: input.userPrompt,
            candidateIndicators,
            targetName,
            fileName,
            content: fallback.content,
            sourceLabel: 'PDF 文本'
          }),
          ...buildLlmCallOptions(input.llmSettings)
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1), input.llmSettings.maxRetries || 3, signal);
      } else if (fileKind === 'pdf') {
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
        try {
          response = await call({
            sysPrompt: effectiveSysPrompt,
            userPrompt: directMultimodalPrompt,
            ...buildLlmCallOptions(input.llmSettings),
            pdfBase64
          }, (message) => reportFileProgress(fileIndex, fileName, message, -1), input.llmSettings.maxRetries || 3, signal);
        } catch (directError) {
          reportFileProgress(fileIndex, fileName, 'PDF 直传失败，正在回退文本提取', 40);
          let fallback;
          try {
            fallback = await extractPdfTextContent(file, parsedPageSpec);
          } catch (_) {
            throw directError;
          }
          if (!fallback.content) {
            throw directError;
          }
          resolvedPages = fallback.resolvedPages;
          scopeLabel = `${fallback.scopeLabel}（PDF 直传失败后回退）`;
          response = await call({
            sysPrompt: effectiveSysPrompt,
            userPrompt: buildTextPrompt({
              userPrompt: input.userPrompt,
              candidateIndicators,
              targetName,
              fileName,
              content: fallback.content,
              sourceLabel: 'PDF 文本'
            }),
            ...buildLlmCallOptions(input.llmSettings)
          }, (message) => reportFileProgress(fileIndex, fileName, message, -1), input.llmSettings.maxRetries || 3, signal);
        }
      } else if (fileKind === 'image') {
        reportFileProgress(fileIndex, fileName, '正在载入图片', 18);
        const imageBase64 = await fileToBase64(file);
        scopeLabel = '图片';
        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: effectiveSysPrompt,
          userPrompt: directMultimodalPrompt,
          ...buildLlmCallOptions(input.llmSettings),
          pdfInputs: [{
            mimeType: file.type || 'image/png',
            data: imageBase64,
            label: fileName ? `输入图片：${fileName}` : '输入图片'
          }]
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1), input.llmSettings.maxRetries || 3, signal);
      } else if (fileKind === 'spreadsheet') {
        reportFileProgress(fileIndex, fileName, '正在读取表格内容', 18);
        const rows = await parseSpreadsheetFile(file);
        const content = stringifySpreadsheetRows(rows);
        scopeLabel = '整表';
        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: effectiveSysPrompt,
          userPrompt: buildTextPrompt({
            userPrompt: input.userPrompt,
            candidateIndicators,
            targetName,
            fileName,
            content,
            sourceLabel: '表格'
          }),
          ...buildLlmCallOptions(input.llmSettings)
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1), input.llmSettings.maxRetries || 3, signal);
      } else if (fileKind === 'text' && String(file?.name || '').toLowerCase().endsWith('.docx')) {
        reportFileProgress(fileIndex, fileName, '正在解析 DOCX 内容', 18);
        const content = await parseDocxFile(file);
        scopeLabel = '全文文本';
        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: effectiveSysPrompt,
          userPrompt: buildTextPrompt({
            userPrompt: input.userPrompt,
            candidateIndicators,
            targetName,
            fileName,
            content,
            sourceLabel: 'DOCX 文档'
          }),
          ...buildLlmCallOptions(input.llmSettings)
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1), input.llmSettings.maxRetries || 3, signal);
      } else if (fileKind === 'text') {
        reportFileProgress(fileIndex, fileName, '正在读取文本内容', 18);
        const content = await readTextFile(file);
        scopeLabel = '全文文本';
        reportFileProgress(fileIndex, fileName, '正在调用模型', 58);
        response = await call({
          sysPrompt: effectiveSysPrompt,
          userPrompt: buildTextPrompt({
            userPrompt: input.userPrompt,
            candidateIndicators,
            targetName,
            fileName,
            content,
            sourceLabel: '文本'
          }),
          ...buildLlmCallOptions(input.llmSettings)
        }, (message) => reportFileProgress(fileIndex, fileName, message, -1), input.llmSettings.maxRetries || 3, signal);
      } else {
        throw new Error('暂不支持该文件类型，请上传 PDF、Excel/CSV 或常见文本文件。');
      }

      reportFileProgress(fileIndex, fileName, '正在解析模型回复', 88);
      const parsed = extractJsonCandidate(response.text);
      const normalizedJson = parsed.status === 'success'
        ? normalizeIterationParsedJson(parsed.parsed, candidateIndicators)
        : null;

      results.push({
        fileId: item.id,
        fileName,
        pageSpec: item.pageSpec,
        resolvedPages,
        scopeLabel,
        status: 'success',
        errorMessage: '',
        rawResponse: response.text,
        parsedJson: normalizedJson,
        jsonParseStatus: parsed.status,
        summaryText: parsed.status === 'success' ? summarizeParsedJson(normalizedJson) : '未解析出 JSON',
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
