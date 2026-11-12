import { summarizePromptOptimizationUsage } from '../utils/promptOptimizationUsage.js';

function formatDateTime(timestamp) {
  if (!timestamp) {
    return '';
  }

  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function buildSummaryRows(run = {}) {
  return [{
    run_id: run.id || '',
    target_name: run.targetName || '',
    indicator_code: run.indicatorCode || '',
    indicator_name: run.indicatorName || '',
    baseline_score: run.baselineScore ?? 0,
    best_candidate_id: run.bestCandidateId || '',
    applied_version_id: run.appliedVersionId || '',
    model_name: run.modelName || '',
    provider_type: run.providerType || '',
    created_at: formatDateTime(run.createdAt),
    updated_at: formatDateTime(run.updatedAt)
  }];
}

function buildCandidateRows(run = {}) {
  return (run.candidates || []).map((candidate) => ({
    candidate_id: candidate.id,
    indicator_code: candidate.indicatorCode || '',
    indicator_name: candidate.indicatorName || '',
    score: candidate.score?.overall ?? 0,
    prompt_text: candidate.promptText || '',
    diagnosis_summary: candidate.diagnosis?.summary || '',
    validation_decision: candidate.validationReview?.decision || '',
    validation_summary: candidate.validationReview?.summary || ''
  }));
}

function buildTraceRows(run = {}) {
  return (run.traceEntries || []).map((entry) => ({
    phase: entry.phase || '',
    indicator_code: entry.indicatorCode || '',
    indicator_name: entry.indicatorName || '',
    message: entry.message || '',
    prompt_text: entry.promptText || '',
    llm_text: entry.llmText || '',
    accepted: entry.accepted || '',
    created_at: formatDateTime(entry.createdAt)
  }));
}

function buildRoundRows(round = {}) {
  return [{
    round: round.round ?? '',
    indicator_code: round.indicatorCode || '',
    indicator_name: round.indicatorName || '',
    baseline_score: round.baselineScore ?? '',
    diagnosis_summary: round.diagnosis?.summary || '',
    diagnosis_root_causes: (round.diagnosis?.rootCauses || []).join('；'),
    diagnosis_pattern_analysis: round.diagnosis?.patternAnalysis || '',
    diagnosis_prompt_risks: (round.diagnosis?.promptRisks || []).join('；'),
    diagnosis_prompt: round.diagnosis?.promptText || '',
    diagnosis_raw_text: round.diagnosis?.rawText || '',
    candidate_prompt: round.candidate?.promptText || '',
    candidate_change_summary: round.candidate?.changeSummary || '',
    candidate_guardrails: (round.candidate?.guardrails || []).join('；'),
    candidate_generation_prompt: round.candidate?.promptTextForGeneration || '',
    candidate_raw_text: round.candidate?.rawText || '',
    validation_score: round.validation?.averageSimilarity ?? '',
    validation_decision: round.validation?.review?.decision || '',
    validation_summary: round.validation?.review?.summary || '',
    validation_risks: (round.validation?.review?.risks || []).join('；'),
    validation_prompt: round.validation?.review?.promptText || '',
    validation_raw_text: round.validation?.review?.rawText || ''
  }];
}

function buildTokenCostRows(run = {}) {
  const usage = summarizePromptOptimizationUsage(run);
  return [
    {
      phase: 'optimization',
      model_name: usage.modelName,
      input_tokens: usage.optimizationInputTokens,
      output_tokens: usage.optimizationOutputTokens,
      total_tokens: usage.optimizationInputTokens + usage.optimizationOutputTokens,
      estimated_cost_usd: usage.optimizationCostUsd
    },
    {
      phase: 'extraction',
      model_name: usage.modelName,
      input_tokens: usage.extractionInputTokens,
      output_tokens: usage.extractionOutputTokens,
      total_tokens: usage.extractionInputTokens + usage.extractionOutputTokens,
      estimated_cost_usd: usage.extractionCostUsd
    },
    {
      phase: 'total',
      model_name: usage.modelName,
      input_tokens: usage.totalInputTokens,
      output_tokens: usage.totalOutputTokens,
      total_tokens: usage.totalInputTokens + usage.totalOutputTokens,
      estimated_cost_usd: usage.totalCostUsd
    }
  ];
}

export function buildPromptOptimizationExportSheets(run = {}) {
  const sheets = {
    summary: buildSummaryRows(run),
    strategy_snapshot: run.strategySnapshot ? [run.strategySnapshot] : [],
    token_cost: buildTokenCostRows(run),
    candidates: buildCandidateRows(run),
    trace: buildTraceRows(run),
    final_result_rows: Array.isArray(run.resultRows) ? run.resultRows : []
  };

  (run.rounds || []).forEach((round, index) => {
    sheets[`round_${index + 1}`] = buildRoundRows(round);
    if (Array.isArray(round.validation?.sampleResults) && round.validation.sampleResults.length > 0) {
      sheets[`round_${index + 1}_samples`] = round.validation.sampleResults.map((item) => ({
        report_name: item.report_name || '',
        similarity: item.similarity ?? '',
        expected_value: item.expectedValue || '',
        actual_value: item.actualValue || '',
        text: item.text || ''
      }));
    }
  });

  return sheets;
}

export async function exportPromptOptimizationRunWorkbook(run = {}) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const sheets = buildPromptOptimizationExportSheets(run);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  Object.entries(sheets).forEach(([sheetName, rows]) => {
    const worksheet = XLSX.utils.json_to_sheet(Array.isArray(rows) ? rows : []);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  });

  XLSX.writeFile(workbook, `prompt_optimization_${run.indicatorCode || 'run'}_${timestamp}.xlsx`);
}
