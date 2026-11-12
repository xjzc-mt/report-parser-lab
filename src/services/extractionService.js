import { ESG_EXPERT_SYSTEM_PROMPT } from '../constants/extraction.js';
import { parseExcel, parsePDF, fileToBase64 } from './fileParsers.js';
import { buildExtractionSystemPrompt, callLLMWithRetry, estimateCost, isPricingConfigured, usesPdfDirectInput } from './llmClient.js';
import {
  buildMissingResult,
  getRequirementValueType,
  getResultsArray,
  getSelectedIndicatorTypes,
  mapBatchResults,
  normalizeRequirementRow,
  normalizeValueType,
  splitRequirementsIntoBatches
} from '../utils/extraction.js';
import { resolveSettingsWithPlatformDefaults } from '../utils/platformDefaultModel.js';
import { countFoundInputIndicators } from '../utils/extractionStats.js';

function createProgressReporter(onProgress) {
  return (message, percentage = -1) => {
    onProgress?.({
      message,
      percentage,
      timestamp: new Date().toLocaleTimeString()
    });
  };
}

function splitRequirementsForBatches(requirements, batchSize) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return { allBatches: [], counts: { textCount: 0, numericCount: 0, intensityCount: 0, currencyCount: 0 } };
  }

  if (!requirements.some((requirement) => requirement.system_prompt)) {
    return splitRequirementsIntoBatches(requirements, batchSize);
  }

  const groups = new Map();
  for (const requirement of requirements) {
    const type = normalizeValueType(requirement.value_type);
    const systemPrompt = requirement.system_prompt || '';
    const key = `${type}\u0000${systemPrompt}`;
    if (!groups.has(key)) {
      groups.set(key, { type, items: [] });
    }
    groups.get(key).items.push(requirement);
  }

  const allBatches = [];
  const counts = { textCount: 0, numericCount: 0, intensityCount: 0, currencyCount: 0 };
  for (const group of groups.values()) {
    const { type, items } = group;
    if (type === '文字型') counts.textCount += items.length;
    else if (type === '数值型') counts.numericCount += items.length;
    else if (type === '强度型') counts.intensityCount += items.length;
    else if (type === '货币型') counts.currencyCount += items.length;
    for (let index = 0; index < items.length; index += batchSize) {
      allBatches.push({
        batch: items.slice(index, index + batchSize),
        batchType: type || group.type
      });
    }
  }
  return { allBatches, counts };
}

async function processExtractionBatch({
  batch,
  batchIndex,
  batchType,
  totalBatches,
  usePdfInput,
  systemPrompts,
  apiUrl,
  apiKey,
  modelName,
  providerType,
  serverManaged,
  companyConnectionId,
  pageKey,
  runId,
  supportsPdfUpload,
  requestOptions,
  maxRetries,
  pdfBase64,
  docText,
  signal,
  reportProgress
}) {
  const normalizedBatchType = normalizeValueType(batchType);
  const typeLabel = normalizedBatchType || batchType;
  reportProgress(`开始批次 ${batchIndex + 1}/${totalBatches}（${typeLabel}，${batch.length} 个指标）...`);

  const assetSystemPrompt = batch.find((requirement) => requirement.system_prompt)?.system_prompt || '';
  let sysPrompt = systemPrompts[normalizedBatchType];
  if (assetSystemPrompt) {
    if (assetSystemPrompt.includes('Output STRICTLY in JSON format') || assetSystemPrompt.includes('"results"')) {
      sysPrompt = assetSystemPrompt;
    } else {
      sysPrompt = `${assetSystemPrompt}\n\n${systemPrompts[normalizedBatchType]}`;
    }
  }
  const requirementText = batch.map((requirement) => (
    `Indicator Code: ${requirement.indicator_code}\n` +
    `Indicator Name: ${requirement.indicator_name || ''}\n` +
    `Value Type: ${getRequirementValueType(requirement)}\n` +
    `Definition: ${requirement.definition || ''}\n` +
    `Guidance: ${requirement.guidance || 'None'}\n` +
    `Prompt: ${requirement.prompt || 'None'}`
  )).join('\n---\n');

  const taskPrompt = usePdfInput
    ? `Requirements:\n<requirements>\n${requirementText}\n</requirements>\n\nPlease extract the requested info from the attached PDF. Remember: pdf_numbers = physical PDF page numbers, NOT content page numbers.`
    : `Document:\n<document>\n${docText}\n</document>\n\nRequirements:\n<requirements>\n${requirementText}\n</requirements>\n\nPlease return the structured JSON. Remember: pdf_numbers = [Page X] markers.`;

  const userPrompt = `Global Instructions:\n<global_instructions>\n${ESG_EXPERT_SYSTEM_PROMPT}\n</global_instructions>\n\nTask Instructions:\n<task_instructions>\n${taskPrompt}\n</task_instructions>`;

  const result = await callLLMWithRetry({
    sysPrompt,
    userPrompt,
    apiUrl,
    apiKey,
    modelName,
    providerType,
    serverManaged,
    companyConnectionId,
    pageKey,
    runId,
    supportsPdfUpload,
    requestOptions,
    pdfBase64
  }, reportProgress, maxRetries, signal);

  const batchCost = estimateCost(modelName, result.usage.input_tokens, result.usage.output_tokens);
  reportProgress(`批次 ${batchIndex + 1} Token：输入 ${result.usage.input_tokens} / 输出 ${result.usage.output_tokens}，成本 $${batchCost.toFixed(4)}`);

  try {
    const cleanJson = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);
    const resultsArray = getResultsArray(parsedData);

    return {
      batchIndex,
      batchResults: mapBatchResults(batch, resultsArray),
      usage: result.usage,
      batchCost
    };
  } catch (error) {
    console.warn(`Failed to parse batch ${batchIndex + 1} JSON`, error);
    reportProgress(
      `警告：批次 ${batchIndex + 1} 解析失败，已将 ${batch.length} 个指标标记为未找到。`
    );
    return {
      batchIndex,
      failed: true,
      batchResults: batch.map(buildMissingResult),
      usage: result.usage,
      batchCost
    };
  }
}

export function resolveApiKey(settings, env = undefined) {
  return resolveSettingsWithPlatformDefaults(settings, env).apiKey;
}

export async function runExtractionJob({ pdfFile, csvFile, requirements: providedRequirements, settings, onProgress, onPartialResults, signal }) {
  const throwIfAborted = () => {
    if (signal?.aborted) {
      const error = new Error('提取已取消');
      error.name = 'AbortError';
      throw error;
    }
  };
  throwIfAborted();
  const runtimeSettings = resolveSettingsWithPlatformDefaults(settings);
  const reportProgress = createProgressReporter(onProgress);
  const startTime = new Date();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  reportProgress('开始处理文件...', 0);
  let requirements;
  if (Array.isArray(providedRequirements) && providedRequirements.length > 0) {
    reportProgress('正在读取 Prompt 资产需求...', 2);
    requirements = providedRequirements.map(normalizeRequirementRow);
  } else {
    reportProgress('正在解析需求 Excel...', 2);
    requirements = (await parseExcel(csvFile)).map(normalizeRequirementRow);
  }
  const selectedIndicatorTypes = getSelectedIndicatorTypes(settings.indicatorTypes);

  if (selectedIndicatorTypes.length === 0) {
    throw new Error('请至少选择一种要处理的指标类型。');
  }

  const selectedTypeSet = new Set(selectedIndicatorTypes);
  const filteredRequirements = requirements.filter((requirement) => (
    selectedTypeSet.has(getRequirementValueType(requirement))
  ));

  if (filteredRequirements.length === 0) {
    throw new Error(`没有需求行匹配当前选择的指标类型：${selectedIndicatorTypes.join(', ')}`);
  }

  reportProgress(
    `已加载 ${requirements.length} 条需求，本次处理 ${filteredRequirements.length} 条，类型：${selectedIndicatorTypes.join(', ')}`,
    3
  );

  const usePdfInput = usesPdfDirectInput(runtimeSettings);
  let pdfBase64 = null;
  let documentText = '';
  let documentTextPromise = null;
  const ensureDocumentText = async () => {
    if (documentText) {
      return documentText;
    }
    if (!documentTextPromise) {
      documentTextPromise = parsePDF(pdfFile, reportProgress).then((pdfPagesData) => {
        const pagesWithText = pdfPagesData.filter((page) => String(page.text || '').trim().length > 0);
        if (pagesWithText.length === 0) {
          throw new Error('PDF 没有可提取的文字层，无法回退文本；请改用支持 PDF 直传的模型或先 OCR。');
        }
        documentText = pdfPagesData.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join('\n\n');
        return documentText;
      }).catch((error) => {
        documentTextPromise = null;
        throw error;
      });
    }
    return documentTextPromise;
  };

  if (usePdfInput) {
    reportProgress('正在准备 PDF 直传输入...', 5);
    pdfBase64 = await fileToBase64(pdfFile);
    reportProgress('PDF 直传输入准备完成。', 10);
  } else {
    reportProgress('正在本地解析 PDF 文本...', 5);
    await ensureDocumentText();
    reportProgress('本地解析完成。', 10);
  }

  reportProgress('正在准备 AI 提取...', 12);

  const { allBatches, counts } = splitRequirementsForBatches(filteredRequirements, Number(runtimeSettings.batchSize));
  const totalBatches = allBatches.length;
  const concurrentBatches = totalBatches > 0 ? Math.min(Number(runtimeSettings.maxConcurrency), totalBatches) : 0;

  reportProgress(
    `已拆分为 ${totalBatches} 个批次，批次大小 ${runtimeSettings.batchSize}（文字 ${counts.textCount}、数值 ${counts.numericCount}、强度 ${counts.intensityCount}、货币 ${counts.currencyCount}）`,
    13
  );

  if (concurrentBatches > 0) {
    reportProgress(`最多并行运行 ${concurrentBatches} 个请求...`, 14);
  }

  const systemPrompts = {
    文字型: buildExtractionSystemPrompt({ isGemini: usePdfInput, batchType: '文字型' }),
    数值型: buildExtractionSystemPrompt({ isGemini: usePdfInput, batchType: '数值型' }),
    强度型: buildExtractionSystemPrompt({ isGemini: usePdfInput, batchType: '强度型' }),
    货币型: buildExtractionSystemPrompt({ isGemini: usePdfInput, batchType: '货币型' })
  };

  const systemPromptsText = {
    文字型: buildExtractionSystemPrompt({ isGemini: false, batchType: '文字型' }),
    数值型: buildExtractionSystemPrompt({ isGemini: false, batchType: '数值型' }),
    强度型: buildExtractionSystemPrompt({ isGemini: false, batchType: '强度型' }),
    货币型: buildExtractionSystemPrompt({ isGemini: false, batchType: '货币型' })
  };

  const batchResults = new Array(totalBatches);
  let nextBatchIndex = 0;
  let completedBatches = 0;
  let startedBatches = 0;
  let completedIndicators = 0;
  let startedIndicators = 0;
  let foundIndicators = 0;
  let finalResults = [];
  let stopped = false;
  let failedBatches = 0;
  let failedIndicators = 0;
  let pdfTextFallbacks = 0;

  async function runBatchWorker() {
    while (nextBatchIndex < totalBatches) {
      if (signal?.aborted) {
        stopped = true;
        break;
      }
      const currentBatchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      const { batch, batchType } = allBatches[currentBatchIndex];
      startedBatches += 1;
      startedIndicators += batch.length;

      let processedBatch;

      try {
        processedBatch = await processExtractionBatch({
          batch,
          batchIndex: currentBatchIndex,
          batchType,
          totalBatches,
          usePdfInput,
          systemPrompts,
          apiUrl: runtimeSettings.apiUrl.trim(),
          apiKey: runtimeSettings.apiKey,
          modelName: runtimeSettings.modelName.trim(),
          providerType: runtimeSettings.providerType,
          serverManaged: runtimeSettings.serverManaged,
          companyConnectionId: runtimeSettings.companyConnectionId,
          pageKey: runtimeSettings.pageKey,
          runId: runtimeSettings.runId,
          supportsPdfUpload: runtimeSettings.supportsPdfUpload,
          requestOptions: runtimeSettings.requestOptions,
          maxRetries: runtimeSettings.maxRetries,
          pdfBase64,
          docText: documentText,
          signal,
          reportProgress
        });
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) {
          stopped = true;
          break;
        }

        // PDF 直传失败时只回退一次到文本解析；只影响本批次，不重复整个文件队列。
        if (usePdfInput) {
          try {
            const fallbackText = await ensureDocumentText();
            reportProgress(`批次 ${currentBatchIndex + 1} PDF 直传失败，已回退文本解析重试。`);
            processedBatch = await processExtractionBatch({
              batch,
              batchIndex: currentBatchIndex,
              batchType,
              totalBatches,
              usePdfInput: false,
              systemPrompts: systemPromptsText,
              apiUrl: runtimeSettings.apiUrl.trim(),
              apiKey: runtimeSettings.apiKey,
              modelName: runtimeSettings.modelName.trim(),
              providerType: runtimeSettings.providerType,
              serverManaged: runtimeSettings.serverManaged,
              companyConnectionId: runtimeSettings.companyConnectionId,
              pageKey: runtimeSettings.pageKey,
              runId: runtimeSettings.runId,
              supportsPdfUpload: runtimeSettings.supportsPdfUpload,
              requestOptions: runtimeSettings.requestOptions,
              maxRetries: runtimeSettings.maxRetries,
              pdfBase64: null,
              docText: fallbackText,
              signal,
              reportProgress
            });
            pdfTextFallbacks += 1;
          } catch (fallbackError) {
            if (fallbackError?.name === 'AbortError' || signal?.aborted) {
              stopped = true;
              break;
            }
            error = fallbackError;
          }
        }

        if (!processedBatch) {
          failedBatches += 1;
          failedIndicators += batch.length;
          console.error(`Batch ${currentBatchIndex + 1} failed`, error);
          reportProgress(
            `批次 ${currentBatchIndex + 1} 重试后仍失败：${error.message}。已将 ${batch.length} 个指标标记为未找到。`
          );
          processedBatch = {
            batchIndex: currentBatchIndex,
            batchResults: batch.map(buildMissingResult),
            usage: { input_tokens: 0, output_tokens: 0 },
            batchCost: 0
          };
        }
      }

      if (processedBatch.failed) {
        failedBatches += 1;
        failedIndicators += batch.length;
      }
      foundIndicators += countFoundInputIndicators(batch, processedBatch.batchResults);
      completedBatches += 1;
      completedIndicators += batch.length;
      batchResults[processedBatch.batchIndex] = processedBatch.batchResults;
      totalInputTokens += processedBatch.usage.input_tokens;
      totalOutputTokens += processedBatch.usage.output_tokens;
      totalCost += processedBatch.batchCost;

      finalResults = batchResults.flatMap((result) => result || []);
      onPartialResults?.(finalResults);

      reportProgress(
        `已完成 ${completedBatches}/${totalBatches} 个批次...`,
        15 + Math.round((completedBatches / totalBatches) * 80)
      );
    }
  }

  if (concurrentBatches > 0) {
    await Promise.all(Array.from({ length: concurrentBatches }, () => runBatchWorker()));
    finalResults = batchResults.flatMap((result) => result || []);
  }

  const endTime = new Date();
  const durationMs = endTime - startTime;
  const duration = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;
  const unstartedIndicators = Math.max(0, filteredRequirements.length - startedIndicators);

  const extractionStats = {
    model: runtimeSettings.modelName.trim(),
    selectedTypes: selectedIndicatorTypes.join(', '),
    startTime: startTime.toLocaleString(),
    endTime: endTime.toLocaleString(),
    duration,
    totalInputIndicators: requirements.length,
    totalIndicators: filteredRequirements.length,
    textCount: counts.textCount,
    numericCount: counts.numericCount,
    intensityCount: counts.intensityCount,
    currencyCount: counts.currencyCount,
    totalBatches,
    executedBatches: startedBatches,
    startedBatches,
    completedBatches,
    startedIndicators,
    completedIndicators,
    unstartedIndicators,
    foundIndicators,
    failedBatches,
    failedIndicators,
    pdfTextFallbacks,
    textBatches: allBatches.filter((item) => item.batchType === '文字型').length,
    numericBatches: allBatches.filter((item) => item.batchType === '数值型').length,
    intensityBatches: allBatches.filter((item) => item.batchType === '强度型').length,
    currencyBatches: allBatches.filter((item) => item.batchType === '货币型').length,
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    pricingConfigured: isPricingConfigured(runtimeSettings.modelName)
  };

  reportProgress(
    `提取完成。总 Token：${totalInputTokens + totalOutputTokens}，成本 $${totalCost.toFixed(4)}，耗时 ${duration}`,
    100
  );

  return {
    results: finalResults,
    stats: extractionStats,
    stopped
  };
}
