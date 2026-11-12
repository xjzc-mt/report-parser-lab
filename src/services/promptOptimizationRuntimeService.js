import { NOT_FOUND_VALUE } from '../constants/extraction.js';
import { buildExtractionSystemPrompt, callLLMWithRetry, usesPdfDirectInput } from './llmClient.js';
import { parsePDF } from './fileParsers.js';
import { buildOptimizationPageContext, calculateSimilarity, selectOptimizationTrainingAndValidationRows } from './testBenchService.js';
import { extractPdfPages, parsePdfNumbers, uint8ArrayToBase64 } from './pdfPageExtractor.js';
import { extractJsonCandidate } from '../utils/promptIterationModel.js';
import { getResultsArray, normalizeValueType } from '../utils/extraction.js';
import {
  normalizePromptOptimizationStrategy,
  renderPromptOptimizationTemplate
} from './promptOptimizationStrategyService.js';

function normalizeString(value) {
  return String(value || '').trim();
}

function usesDirectPdfInput(llmSettings) {
  return usesPdfDirectInput(llmSettings);
}

function findPdfFile(pdfFiles = [], reportName) {
  const target = normalizeString(reportName);
  return (Array.isArray(pdfFiles) ? pdfFiles : []).find((file) => file.name.replace(/\.[^/.]+$/, '') === target) || null;
}

function buildSingleIndicatorPrompt(row, promptText) {
  const indicatorCode = normalizeString(row?.indicator_code);
  const indicatorName = normalizeString(row?.indicator_name) || '未知指标';
  const instruction = normalizeString(promptText);

  if (!instruction) {
    throw new Error(`指标 [${indicatorCode}: ${indicatorName}] 缺少提取提示词`);
  }

  return `Please extract the following 1 ESG indicators from the provided PDF report:

1. Indicator Code: "${indicatorCode}"
   Indicator Name: "${indicatorName}"
   Extraction Instructions: "${instruction}"

Return results in the JSON format specified in the system prompt.
For each indicator, use the EXACT indicator_code provided above.
If an indicator cannot be found, use "${NOT_FOUND_VALUE}" as the value.`;
}

async function getPdfInputForLlm(pdfData, isGemini) {
  if (isGemini) {
    return { pdfBase64: uint8ArrayToBase64(pdfData), pdfText: null };
  }

  const blob = new Blob([pdfData], { type: 'application/pdf' });
  const tempFile = new File([blob], 'prompt_optimization_extract.pdf', { type: 'application/pdf' });
  const pages = await parsePDF(tempFile);
  return {
    pdfBase64: null,
    pdfText: pages.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join('\n\n')
  };
}

export async function buildOptimizationPdfInputs({
  rows = [],
  pdfFiles = [],
  windowRadius = 1
} = {}, deps = {}) {
  const extractPages = deps.extractPdfPages ?? extractPdfPages;
  const toBase64 = deps.toBase64 ?? uint8ArrayToBase64;
  const inputs = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const pdfFile = findPdfFile(pdfFiles, row.report_name);
    if (!pdfFile) {
      continue;
    }

    const pageContext = buildOptimizationPageContext(row, { windowRadius });
    if (pageContext.diagnosticPages.length === 0) {
      continue;
    }

    try {
      const { pdfData } = await extractPages(pdfFile, pageContext.diagnosticPages, row.report_name);
      inputs.push({
        mimeType: 'application/pdf',
        data: toBase64(pdfData),
        label: `附件：${row.report_name || '未命名报告'}，诊断页 ${pageContext.diagnosticPages.join(',')}`
      });
    } catch (_) {
      // 切页失败时跳过该附件，不阻断其他样本
    }
  }

  return inputs;
}

function buildComparableValue(row = {}) {
  const valueType = normalizeValueType(row.value_type_1 || row.value_type);
  if (valueType === '文字型') {
    return normalizeString(row.text_value || row.llm_text_value);
  }

  return [
    row.num_value ?? row.llm_num_value,
    row.unit ?? row.llm_unit,
    row.currency ?? row.llm_currency,
    row.numerator_unit ?? row.llm_numerator_unit,
    row.denominator_unit ?? row.llm_denominator_unit
  ]
    .map((value) => normalizeString(value))
    .filter(Boolean)
    .join(' ');
}

function parseJsonOrFallback(text) {
  const candidate = extractJsonCandidate(text);
  return candidate.status === 'success' ? candidate.parsed : null;
}

function formatReportExamples(reportExamples = []) {
  if (!reportExamples.length) {
    return '暂无样本。';
  }

  return reportExamples.map((item, index) => {
    const goldContext = normalizeString(item.goldContextText).slice(0, 1200);
    const llmContext = normalizeString(item.llmContextText).slice(0, 1200);
    const diagnosticContext = normalizeString(item.diagnosticContextText).slice(0, 1200);

    return [
      `案例 ${index + 1}：${item.report_name || '未命名报告'}`,
      `- 测试集页码：${item.gold_pdf_numbers || item.pdf_numbers || '未提供'}`,
      `- 初版LLM命中页码：${item.llm_pdf_numbers || '未提供'}`,
      `- 诊断组合页码：${item.diagnostic_pdf_numbers || '未提供'}`,
      `- 标准答案：${item.test_answer || '（空）'}`,
      `- LLM结果：${item.llm_result || '未提取'}`,
      `- 当前相似度：${item.similarity ?? '-'}`,
      goldContext ? `- 测试集切片原文：\n${goldContext}` : '',
      llmContext ? `- 初版LLM切片原文：\n${llmContext}` : '',
      diagnosticContext ? `- 诊断组合切片原文：\n${diagnosticContext}` : ''
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function formatValidationSummary({ baselineScore, score, sampleResults = [] }) {
  const sampleLines = sampleResults.map((item, index) => (
    `${index + 1}. ${item.report_name || '未命名报告'} | 相似度 ${item.similarity ?? 0} | 结果 ${item.text || item.value || '-'}`
  )).join('\n');

  return [
    `基线平均分：${Number(baselineScore || 0).toFixed(1)}`,
    `候选平均分：${Number(score || 0).toFixed(1)}`,
    sampleLines ? `样本结果：\n${sampleLines}` : '样本结果：暂无'
  ].join('\n');
}

async function buildReportExamples(rows, pdfFiles, strategy, llmSettings, contextCache = new Map(), deps = {}) {
  const { trainingRows, validationRows, usesHoldoutReports } = selectOptimizationTrainingAndValidationRows(rows, {
    trainingLimit: strategy.trainingLimit,
    validationLimit: strategy.validationLimit
  });
  const reportExamples = [];
  const useMultimodalInputs = usesDirectPdfInput(llmSettings);
  const pdfInputs = useMultimodalInputs
    ? await buildOptimizationPdfInputs({
        rows: trainingRows,
        pdfFiles,
        windowRadius: strategy.windowRadius
      }, {
        extractPdfPages: deps.extractPdfPages,
        toBase64: deps.toBase64
      })
    : [];

  const readContext = async (pdfFile, reportName, pageNumbers) => {
    if (!pdfFile || pageNumbers.length === 0) {
      return '';
    }

    const cacheKey = `${reportName}|||${pageNumbers.join(',')}`;
    if (contextCache.has(cacheKey)) {
      return contextCache.get(cacheKey);
    }

    try {
      const { pdfData } = await extractPdfPages(pdfFile, pageNumbers, reportName);
      const { pdfText } = await getPdfInputForLlm(pdfData, false);
      const text = pdfText || '';
      contextCache.set(cacheKey, text);
      return text;
    } catch (_) {
      contextCache.set(cacheKey, '');
      return '';
    }
  };

  for (const row of trainingRows) {
    const pdfFile = findPdfFile(pdfFiles, row.report_name);
    const pageContext = buildOptimizationPageContext(row, { windowRadius: strategy.windowRadius });
    const goldContextText = useMultimodalInputs ? '' : await readContext(pdfFile, row.report_name, pageContext.goldPages);
    const llmContextText = useMultimodalInputs ? '' : await readContext(pdfFile, row.report_name, pageContext.llmPages);
    const diagnosticContextText = useMultimodalInputs ? '' : await readContext(pdfFile, row.report_name, pageContext.diagnosticPages);

    reportExamples.push({
      report_name: row.report_name,
      pdf_numbers: row.pdf_numbers,
      gold_pdf_numbers: pageContext.goldPages.join(',') || normalizeString(row.pdf_numbers),
      llm_pdf_numbers: pageContext.llmPages.join(',') || normalizeString(row.llm_pdf_numbers),
      diagnostic_pdf_numbers: pageContext.diagnosticPages.join(',') || normalizeString(row.pdf_numbers || row.llm_pdf_numbers),
      test_answer: buildComparableValue(row),
      llm_result: buildComparableValue({
        value_type: row.value_type,
        value_type_1: row.value_type_1,
        text_value: row.llm_text_value,
        num_value: row.llm_num_value,
        unit: row.llm_unit,
        currency: row.llm_currency,
        numerator_unit: row.llm_numerator_unit,
        denominator_unit: row.llm_denominator_unit
      }),
      similarity: Number(row.similarity || 0),
      goldContextText,
      llmContextText,
      diagnosticContextText
    });
  }

  return {
    trainingRows,
    validationRows,
    usesHoldoutReports,
    pdfInputs,
    reportExamples,
    reportExamplesText: formatReportExamples(reportExamples)
  };
}

async function callStrategyStage({
  systemPrompt,
  userTemplate,
  context,
  llmSettings,
  tokenStats,
  pdfInputs = [],
  callLLM = callLLMWithRetry,
  maxRetries = 3
}) {
  const renderedPrompt = renderPromptOptimizationTemplate(userTemplate, context);
  const { text, usage } = await callLLM({
    sysPrompt: systemPrompt,
    userPrompt: renderedPrompt,
    apiUrl: llmSettings.apiUrl,
    apiKey: llmSettings.apiKey,
    modelName: llmSettings.modelName,
    providerType: llmSettings.providerType,
    serverManaged: llmSettings.serverManaged,
    companyConnectionId: llmSettings.companyConnectionId,
    pageKey: llmSettings.pageKey,
    runId: llmSettings.runId,
    supportsPdfUpload: llmSettings.supportsPdfUpload,
    requestOptions: llmSettings.requestOptions,
    pdfInputs
  }, null, maxRetries);

  if (tokenStats) {
    tokenStats.optInput += usage?.input_tokens || 0;
    tokenStats.optOutput += usage?.output_tokens || 0;
  }

  return {
    renderedPrompt,
    rawText: text,
    parsed: parseJsonOrFallback(text),
    usage
  };
}

export async function runOptimizationDiagnosis(params) {
  const strategy = normalizePromptOptimizationStrategy(params.strategy);
  const samplePack = await buildReportExamples(
    params.rows,
    params.pdfFiles,
    strategy,
    params.llmSettings,
    params.contextCache,
    {
      extractPdfPages: params.extractPdfPages,
      toBase64: params.toBase64
    }
  );
  const context = {
    indicatorCode: params.indicatorCode,
    indicatorName: params.indicatorName,
    baselinePrompt: params.baselinePrompt,
    reportExamples: samplePack.reportExamplesText
  };

  const response = await callStrategyStage({
    systemPrompt: strategy.diagnosisSystemPrompt,
    userTemplate: strategy.diagnosisUserTemplate,
    context,
    llmSettings: params.llmSettings,
    tokenStats: params.tokenStats,
    pdfInputs: samplePack.pdfInputs,
    callLLM: params.callLLMWithRetry,
    maxRetries: params.maxRetries
  });
  const parsed = response.parsed || {};

  return {
    ...samplePack,
    summary: normalizeString(parsed.summary),
    rootCauses: Array.isArray(parsed.root_causes) ? parsed.root_causes : [],
    patternAnalysis: normalizeString(parsed.pattern_analysis),
    promptRisks: Array.isArray(parsed.prompt_risks) ? parsed.prompt_risks : [],
    renderedPrompt: response.renderedPrompt,
    rawText: response.rawText
  };
}

export async function generateOptimizationCandidate(params) {
  const strategy = normalizePromptOptimizationStrategy(params.strategy);
  const context = {
    indicatorCode: params.indicatorCode,
    indicatorName: params.indicatorName,
    baselinePrompt: params.baselinePrompt,
    diagnosisSummary: [
      params.diagnosis?.summary ? `总结：${params.diagnosis.summary}` : '',
      params.diagnosis?.rootCauses?.length ? `根因：${params.diagnosis.rootCauses.join('；')}` : '',
      params.diagnosis?.patternAnalysis ? `规律：${params.diagnosis.patternAnalysis}` : '',
      params.diagnosis?.promptRisks?.length ? `风险：${params.diagnosis.promptRisks.join('；')}` : ''
    ].filter(Boolean).join('\n'),
    reportExamples: params.diagnosis?.reportExamplesText || ''
  };

  const response = await callStrategyStage({
    systemPrompt: strategy.candidateSystemPrompt,
    userTemplate: strategy.candidateUserTemplate,
    context,
    llmSettings: params.llmSettings,
    tokenStats: params.tokenStats,
    pdfInputs: Array.isArray(params.diagnosis?.pdfInputs) ? params.diagnosis.pdfInputs : [],
    callLLM: params.callLLMWithRetry,
    maxRetries: params.maxRetries
  });
  const parsed = response.parsed || {};

  return {
    promptText: normalizeString(parsed.improved_prompt) || normalizeString(params.baselinePrompt),
    changeSummary: normalizeString(parsed.change_summary),
    guardrails: Array.isArray(parsed.guardrails) ? parsed.guardrails : [],
    renderedPrompt: response.renderedPrompt,
    rawText: response.rawText
  };
}

export async function validateOptimizationCandidate(params) {
  const validationRows = Array.isArray(params.diagnosis?.validationRows)
    ? params.diagnosis.validationRows
    : [];
  const isGemini = usesDirectPdfInput(params.llmSettings);
  const extractPages = params.extractPdfPages ?? extractPdfPages;
  const callLLM = params.callLLMWithRetry ?? callLLMWithRetry;
  const sampleResults = [];
  let totalSimilarity = 0;

  for (const sample of validationRows) {
    const pdfFile = findPdfFile(params.pdfFiles, sample.report_name);
    if (!pdfFile) {
      continue;
    }

    const pageNumbers = parsePdfNumbers(sample.pdf_numbers);
    if (pageNumbers.length === 0) {
      continue;
    }

    const { pdfData } = await extractPages(pdfFile, pageNumbers, sample.report_name);
    const pdfInput = await getPdfInputForLlm(pdfData, isGemini);
    const systemPrompt = buildExtractionSystemPrompt({
      isGemini,
      batchType: normalizeValueType(sample.value_type_1 || sample.value_type)
    });
    const userPrompt = buildSingleIndicatorPrompt(sample, params.promptText);
    const finalUserPrompt = isGemini ? userPrompt : `${userPrompt}\n\n文档内容：\n${pdfInput.pdfText}`;
    const { text, usage } = await callLLM({
      sysPrompt: systemPrompt,
      userPrompt: finalUserPrompt,
      apiUrl: params.llmSettings.apiUrl,
      apiKey: params.llmSettings.apiKey,
      modelName: params.llmSettings.modelName,
      providerType: params.llmSettings.providerType,
      serverManaged: params.llmSettings.serverManaged,
      companyConnectionId: params.llmSettings.companyConnectionId,
      pageKey: params.llmSettings.pageKey,
      runId: params.llmSettings.runId,
      supportsPdfUpload: params.llmSettings.supportsPdfUpload,
      requestOptions: params.llmSettings.requestOptions,
      pdfBase64: pdfInput.pdfBase64
    }, null, params.maxRetries ?? 3);

    if (params.tokenStats) {
      params.tokenStats.extractInput += usage?.input_tokens || 0;
      params.tokenStats.extractOutput += usage?.output_tokens || 0;
    }

    let parsedData = null;
    try {
      parsedData = JSON.parse(text);
    } catch (_) {
      parsedData = parseJsonOrFallback(text);
    }
    const results = getResultsArray(parsedData || {});
    const result = results.find((item) => normalizeString(item?.indicator_code) === normalizeString(sample.indicator_code));
    if (!result) {
      continue;
    }

    const expectedValue = buildComparableValue(sample);
    const actualValue = buildComparableValue(result);
    const similarity = calculateSimilarity(expectedValue, actualValue);
    totalSimilarity += similarity;
    sampleResults.push({
      report_name: sample.report_name,
      similarity,
      text: actualValue || normalizeString(result.text_value || result.num_value),
      expectedValue,
      actualValue
    });
  }

  return {
    averageSimilarity: sampleResults.length > 0 ? totalSimilarity / sampleResults.length : 0,
    sampleResults
  };
}

export async function reviewOptimizationValidation(params) {
  const strategy = normalizePromptOptimizationStrategy(params.strategy);
  const context = {
    indicatorCode: params.indicatorCode,
    indicatorName: params.indicatorName,
    baselinePrompt: params.baselinePrompt,
    candidatePrompt: params.promptText,
    validationSummary: formatValidationSummary({
      baselineScore: params.baselineScore,
      score: params.score,
      sampleResults: params.sampleResults
    })
  };

  const response = await callStrategyStage({
    systemPrompt: strategy.validationSystemPrompt,
    userTemplate: strategy.validationUserTemplate,
    context,
    llmSettings: params.llmSettings,
    tokenStats: params.tokenStats,
    callLLM: params.callLLMWithRetry,
    maxRetries: params.maxRetries
  });
  const parsed = response.parsed || {};

  return {
    decision: normalizeString(parsed.decision) || (Number(params.score || 0) > Number(params.baselineScore || 0) ? 'accept' : 'reject'),
    summary: normalizeString(parsed.summary),
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    renderedPrompt: response.renderedPrompt,
    rawText: response.rawText
  };
}
