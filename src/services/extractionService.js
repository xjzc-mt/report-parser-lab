import { ESG_EXPERT_SYSTEM_PROMPT } from '../constants/extraction.js';
import { parseExcel, parsePDF, fileToBase64 } from './fileParsers.js';
import { buildExtractionSystemPrompt, callLLMWithRetry, estimateCost } from './llmClient.js';
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

function createProgressReporter(onProgress) {
  return (message, percentage = -1) => {
    onProgress?.({
      message,
      percentage,
      timestamp: new Date().toLocaleTimeString()
    });
  };
}

async function processExtractionBatch({
  batch,
  batchIndex,
  batchType,
  totalBatches,
  isGemini,
  systemPrompts,
  apiUrl,
  apiKey,
  modelName,
  requestOptions,
  pdfBase64,
  docText,
  reportProgress
}) {
  const normalizedBatchType = normalizeValueType(batchType);
  const typeLabel = normalizedBatchType || batchType;
  reportProgress(`开始批次 ${batchIndex + 1}/${totalBatches}（${typeLabel}，${batch.length} 个指标）...`);

  const sysPrompt = systemPrompts[normalizedBatchType];
  const requirementText = batch.map((requirement) => (
    `Indicator Code: ${requirement.indicator_code}\n` +
    `Indicator Name: ${requirement.indicator_name || ''}\n` +
    `Value Type: ${getRequirementValueType(requirement)}\n` +
    `Definition: ${requirement.definition || ''}\n` +
    `Guidance: ${requirement.guidance || 'None'}\n` +
    `Prompt: ${requirement.prompt || 'None'}`
  )).join('\n---\n');

  const taskPrompt = isGemini
    ? `Requirements:\n<requirements>\n${requirementText}\n</requirements>\n\nPlease extract the requested info from the attached PDF. Remember: pdf_numbers = physical PDF page numbers, NOT content page numbers.`
    : `Document:\n<document>\n${docText}\n</document>\n\nRequirements:\n<requirements>\n${requirementText}\n</requirements>\n\nPlease return the structured JSON. Remember: pdf_numbers = [Page X] markers.`;

  const userPrompt = `Global Instructions:\n<global_instructions>\n${ESG_EXPERT_SYSTEM_PROMPT}\n</global_instructions>\n\nTask Instructions:\n<task_instructions>\n${taskPrompt}\n</task_instructions>`;

  const result = await callLLMWithRetry({
    sysPrompt,
    userPrompt,
    apiUrl,
    apiKey,
    modelName,
    requestOptions,
    pdfBase64
  }, reportProgress);

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
      batchResults: batch.map(buildMissingResult),
      usage: result.usage,
      batchCost
    };
  }
}

export function resolveApiKey(settings, env = import.meta.env) {
  return resolveSettingsWithPlatformDefaults(settings, env).apiKey;
}

export async function runExtractionJob({ pdfFile, csvFile, settings, onProgress, onPartialResults }) {
  const runtimeSettings = resolveSettingsWithPlatformDefaults(settings);
  const reportProgress = createProgressReporter(onProgress);
  const startTime = new Date();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  reportProgress('开始处理文件...', 0);
  reportProgress('正在解析需求 Excel...', 2);

  const requirements = (await parseExcel(csvFile)).map(normalizeRequirementRow);
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

  const isGemini = runtimeSettings.providerType === 'gemini' || runtimeSettings.apiUrl.includes('googleapis.com');
  let pdfBase64 = null;
  let documentText = '';

  if (isGemini) {
    reportProgress('正在为 Gemini 原生提取准备 PDF...', 5);
    pdfBase64 = await fileToBase64(pdfFile);
    reportProgress('Gemini 输入准备完成。', 10);
  } else {
    reportProgress('正在本地解析 PDF 文本...', 5);
    const pdfPagesData = await parsePDF(pdfFile, reportProgress);
    documentText = pdfPagesData.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join('\n\n');
    reportProgress('本地解析完成。', 10);
  }

  reportProgress('正在准备 AI 提取...', 12);

  const { allBatches, counts } = splitRequirementsIntoBatches(filteredRequirements, Number(settings.batchSize));
  const totalBatches = allBatches.length;
  const concurrentBatches = totalBatches > 0 ? Math.min(Number(settings.maxConcurrency), totalBatches) : 0;

  reportProgress(
    `已拆分为 ${totalBatches} 个批次，批次大小 ${settings.batchSize}（文字 ${counts.textCount}、数值 ${counts.numericCount}、强度 ${counts.intensityCount}、货币 ${counts.currencyCount}）`,
    13
  );

  if (concurrentBatches > 0) {
    reportProgress(`最多并行运行 ${concurrentBatches} 个请求...`, 14);
  }

  const systemPrompts = {
    文字型: buildExtractionSystemPrompt({ isGemini, batchType: '文字型' }),
    数值型: buildExtractionSystemPrompt({ isGemini, batchType: '数值型' }),
    强度型: buildExtractionSystemPrompt({ isGemini, batchType: '强度型' }),
    货币型: buildExtractionSystemPrompt({ isGemini, batchType: '货币型' })
  };

  const batchResults = new Array(totalBatches);
  let nextBatchIndex = 0;
  let completedBatches = 0;
  let finalResults = [];

  async function runBatchWorker() {
    while (nextBatchIndex < totalBatches) {
      const currentBatchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      const { batch, batchType } = allBatches[currentBatchIndex];

      let processedBatch;

      try {
        processedBatch = await processExtractionBatch({
          batch,
          batchIndex: currentBatchIndex,
          batchType,
          totalBatches,
          isGemini,
          systemPrompts,
          apiUrl: runtimeSettings.apiUrl.trim(),
          apiKey: runtimeSettings.apiKey,
          modelName: runtimeSettings.modelName.trim(),
          requestOptions: runtimeSettings.requestOptions,
          pdfBase64,
          docText: documentText,
          reportProgress
        });
      } catch (error) {
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

      batchResults[processedBatch.batchIndex] = processedBatch.batchResults;
      totalInputTokens += processedBatch.usage.input_tokens;
      totalOutputTokens += processedBatch.usage.output_tokens;
      totalCost += processedBatch.batchCost;
      completedBatches += 1;

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

  const extractionStats = {
    model: settings.modelName.trim(),
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
    textBatches: allBatches.filter((item) => item.batchType === '文字型').length,
    numericBatches: allBatches.filter((item) => item.batchType === '数值型').length,
    intensityBatches: allBatches.filter((item) => item.batchType === '强度型').length,
    currencyBatches: allBatches.filter((item) => item.batchType === '货币型').length,
    totalInputTokens,
    totalOutputTokens,
    totalCost
  };

  reportProgress(
    `提取完成。总 Token：${totalInputTokens + totalOutputTokens}，成本 $${totalCost.toFixed(4)}，耗时 ${duration}`,
    100
  );

  return {
    results: finalResults,
    stats: extractionStats
  };
}
