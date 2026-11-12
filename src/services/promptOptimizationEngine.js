import { createOptimizationRun } from '../utils/promptOptimizationModel.js';

function normalizeIndicatorCode(value) {
  return String(value || '').trim();
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupRowsByIndicator(rows = []) {
  const groups = new Map();

  for (const row of rows) {
    const indicatorCode = normalizeIndicatorCode(row?.indicator_code);
    if (!indicatorCode) {
      continue;
    }

    if (!groups.has(indicatorCode)) {
      groups.set(indicatorCode, []);
    }
    groups.get(indicatorCode).push(row);
  }

  return Array.from(groups.entries()).map(([indicatorCode, groupRows]) => ({
    indicatorCode,
    indicatorName: String(groupRows[0]?.indicator_name || '').trim(),
    rows: groupRows,
    baselinePrompt: String(
      groupRows.find((row) => String(row?.prompt || '').trim())?.prompt ||
      groupRows[0]?.prompt ||
      ''
    ).trim(),
    baselineScore: average(groupRows.map((row) => Number(row?.similarity || 0)))
  }));
}

function sortCandidatesByScore(candidates = []) {
  return [...candidates].sort(
    (left, right) => Number(right?.score?.overall || 0) - Number(left?.score?.overall || 0)
  );
}

const RUN_PHASES = ['diagnosis', 'candidate_generation', 'evaluation', 'validation_review'];

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('运行已取消');
    error.name = 'AbortError';
    throw error;
  }
}

function emitProgress(onProgress, now, event) {
  onProgress?.({
    createdAt: now(),
    ...event
  });
}

export async function runPromptOptimizationEngine(input, deps = {}) {
  const now = deps.now ?? (() => Date.now());
  const generateCandidate = deps.generateCandidate ?? deps.callOptimizer;
  const validateCandidate = deps.validateCandidate;
  const runDiagnosis = deps.runDiagnosis ?? (async () => ({
    summary: '',
    rawText: ''
  }));
  const reviewValidation = deps.reviewValidation ?? (async ({ baselineScore, score }) => ({
    decision: score > baselineScore ? 'accept' : 'reject',
    summary: score > baselineScore ? '候选 Prompt 在验证中优于基线' : '候选 Prompt 未超过当前基线',
    rawText: ''
  }));
  const strategySnapshot = input?.strategy ?? null;
  const onProgress = deps.onProgress;

  if (typeof generateCandidate !== 'function') {
    throw new Error('Prompt 自动优化引擎缺少 callOptimizer 依赖');
  }
  if (typeof validateCandidate !== 'function') {
    throw new Error('Prompt 自动优化引擎缺少 validateCandidate 依赖');
  }

  const groups = groupRowsByIndicator(input?.comparisonRows);
  const resultRows = Array.isArray(input?.comparisonRows)
    ? input.comparisonRows.map((row) => ({ ...row }))
    : [];
  const candidates = [];
  const traceEntries = [];
  const rounds = [];
  const baselinePromptText = String(
    input?.baselineVersion?.userPromptTemplate ||
    groups.find((group) => group.baselinePrompt)?.baselinePrompt ||
    ''
  ).trim();
  const baselineScore = average(groups.map((group) => group.baselineScore));
  const maxIterations = Math.max(1, Number(input?.llmSettings?.maxOptIterations || 1));
  const targetScoreThreshold = Number(input?.llmSettings?.targetScoreThreshold || 0);
  const totalPhaseCount = Math.max(1, groups.length * maxIterations * RUN_PHASES.length);
  let completedPhaseCount = 0;
  const signal = input?.signal;
  throwIfAborted(signal);

  emitProgress(onProgress, now, {
    status: 'running',
    phase: 'initializing',
    round: 0,
    totalRounds: maxIterations,
    completedPhases: completedPhaseCount,
    totalPhases: totalPhaseCount,
    percent: 0,
    message: '开始准备自动优化运行'
  });

  for (const group of groups) {
    throwIfAborted(signal);
    let currentBaselinePrompt = group.baselinePrompt || baselinePromptText;
    let currentBaselineScore = group.baselineScore;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      throwIfAborted(signal);
      if (targetScoreThreshold > 0 && currentBaselineScore >= targetScoreThreshold) {
        emitProgress(onProgress, now, {
          status: 'stopped',
          phase: 'threshold_reached',
          round: iteration - 1,
          totalRounds: maxIterations,
          indicatorCode: group.indicatorCode,
          indicatorName: group.indicatorName,
          score: currentBaselineScore,
          threshold: targetScoreThreshold,
          completedPhases: completedPhaseCount,
          totalPhases: totalPhaseCount,
          percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
          message: `达到目标阈值 ${targetScoreThreshold}，提前停止后续轮次`
        });
        break;
      }

      const candidateId = `cand_${group.indicatorCode}_${iteration}`;

      emitProgress(onProgress, now, {
        status: 'running',
        phase: 'diagnosis',
        round: iteration,
        totalRounds: maxIterations,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        completedPhases: completedPhaseCount,
        totalPhases: totalPhaseCount,
        percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
        message: `第 ${iteration} 轮诊断中`
      });
      const diagnosis = await runDiagnosis({
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        baselinePrompt: currentBaselinePrompt,
        rows: group.rows,
        llmSettings: input?.llmSettings,
        pdfFiles: input?.pdfFiles,
        strategy: strategySnapshot
      });
      completedPhaseCount += 1;
      emitProgress(onProgress, now, {
        status: 'completed',
        phase: 'diagnosis',
        round: iteration,
        totalRounds: maxIterations,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        completedPhases: completedPhaseCount,
        totalPhases: totalPhaseCount,
        percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
        message: String(diagnosis?.summary || diagnosis?.message || '已完成诊断').trim()
      });

      traceEntries.push({
        id: `trace_diagnosis_${group.indicatorCode}_${iteration}`,
        phase: 'diagnosis',
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        message: String(diagnosis?.summary || diagnosis?.message || '已完成诊断').trim(),
        promptText: String(diagnosis?.renderedPrompt || '').trim(),
        llmText: String(diagnosis?.rawText || '').trim(),
        createdAt: now()
      });

      emitProgress(onProgress, now, {
        status: 'running',
        phase: 'candidate_generation',
        round: iteration,
        totalRounds: maxIterations,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        completedPhases: completedPhaseCount,
        totalPhases: totalPhaseCount,
        percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
        message: `第 ${iteration} 轮生成候选 Prompt`
      });
      const optimizerResult = await generateCandidate({
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        baselinePrompt: currentBaselinePrompt,
        rows: group.rows,
        llmSettings: input?.llmSettings,
        pdfFiles: input?.pdfFiles,
        diagnosis,
        strategy: strategySnapshot
      });
      completedPhaseCount += 1;

      const promptText = String(
        optimizerResult?.promptText ||
        optimizerResult?.improvedPrompt ||
        currentBaselinePrompt
      ).trim();
      emitProgress(onProgress, now, {
        status: 'completed',
        phase: 'candidate_generation',
        round: iteration,
        totalRounds: maxIterations,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        completedPhases: completedPhaseCount,
        totalPhases: totalPhaseCount,
        percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
        message: `第 ${iteration} 轮候选 Prompt 已生成`
      });

      traceEntries.push({
        id: `trace_candidate_${group.indicatorCode}_${iteration}`,
        phase: 'candidate_generation',
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        message: `第 ${iteration} 轮生成候选 Prompt：${promptText}`,
        promptText: String(optimizerResult?.renderedPrompt || '').trim(),
        llmText: String(optimizerResult?.rawText || '').trim(),
        createdAt: now()
      });

      emitProgress(onProgress, now, {
        status: 'running',
        phase: 'evaluation',
        round: iteration,
        totalRounds: maxIterations,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        completedPhases: completedPhaseCount,
        totalPhases: totalPhaseCount,
        percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
        message: `第 ${iteration} 轮验证重跑中`
      });
      const evaluation = await validateCandidate({
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        promptText,
        baselinePrompt: currentBaselinePrompt,
        rows: group.rows,
        llmSettings: input?.llmSettings,
        pdfFiles: input?.pdfFiles,
        diagnosis,
        strategy: strategySnapshot
      });

      const score = Number(evaluation?.averageSimilarity || 0);
      completedPhaseCount += 1;
      emitProgress(onProgress, now, {
        status: 'completed',
        phase: 'evaluation',
        round: iteration,
        totalRounds: maxIterations,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        completedPhases: completedPhaseCount,
        totalPhases: totalPhaseCount,
        percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
        score,
        message: `第 ${iteration} 轮验证平均分 ${score}`
      });
      traceEntries.push({
        id: `trace_eval_${group.indicatorCode}_${iteration}`,
        phase: 'evaluation',
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        message: `第 ${iteration} 轮验证平均分 ${score}`,
        promptText: String(evaluation?.renderedPrompt || '').trim(),
        createdAt: now()
      });

      emitProgress(onProgress, now, {
        status: 'running',
        phase: 'validation_review',
        round: iteration,
        totalRounds: maxIterations,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        completedPhases: completedPhaseCount,
        totalPhases: totalPhaseCount,
        percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
        score,
        message: `第 ${iteration} 轮评审中`
      });
      const validationReview = await reviewValidation({
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        baselinePrompt: currentBaselinePrompt,
        promptText,
        baselineScore: currentBaselineScore,
        score,
        sampleResults: Array.isArray(evaluation?.sampleResults) ? evaluation.sampleResults : [],
        rows: group.rows,
        llmSettings: input?.llmSettings,
        strategy: strategySnapshot
      });
      completedPhaseCount += 1;
      emitProgress(onProgress, now, {
        status: 'completed',
        phase: 'validation_review',
        round: iteration,
        totalRounds: maxIterations,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        completedPhases: completedPhaseCount,
        totalPhases: totalPhaseCount,
        percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
        score,
        message: String(validationReview?.summary || validationReview?.message || '已完成验证评审').trim()
      });
      traceEntries.push({
        id: `trace_validation_review_${group.indicatorCode}_${iteration}`,
        phase: 'validation_review',
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        message: String(validationReview?.summary || validationReview?.message || '已完成验证评审').trim(),
        promptText: String(validationReview?.renderedPrompt || '').trim(),
        llmText: String(validationReview?.rawText || '').trim(),
        accepted: String(validationReview?.decision || '').trim(),
        createdAt: now()
      });

      candidates.push({
        id: candidateId,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        promptText,
        score: { overall: score },
        sampleResults: Array.isArray(evaluation?.sampleResults) ? evaluation.sampleResults : [],
        diagnosis,
        validationReview
      });
      rounds.push({
        round: iteration,
        indicatorCode: group.indicatorCode,
        indicatorName: group.indicatorName,
        baselineScore: currentBaselineScore,
        diagnosis: {
          summary: String(diagnosis?.summary || '').trim(),
          rootCauses: Array.isArray(diagnosis?.rootCauses) ? diagnosis.rootCauses : [],
          patternAnalysis: String(diagnosis?.patternAnalysis || '').trim(),
          promptRisks: Array.isArray(diagnosis?.promptRisks) ? diagnosis.promptRisks : [],
          promptText: String(diagnosis?.renderedPrompt || '').trim(),
          rawText: String(diagnosis?.rawText || '').trim()
        },
        candidate: {
          id: candidateId,
          promptText,
          changeSummary: String(optimizerResult?.changeSummary || '').trim(),
          guardrails: Array.isArray(optimizerResult?.guardrails) ? optimizerResult.guardrails : [],
          promptTextForGeneration: String(optimizerResult?.renderedPrompt || '').trim(),
          rawText: String(optimizerResult?.rawText || '').trim()
        },
        validation: {
          averageSimilarity: score,
          sampleResults: Array.isArray(evaluation?.sampleResults) ? evaluation.sampleResults : [],
          review: {
            decision: String(validationReview?.decision || '').trim(),
            summary: String(validationReview?.summary || '').trim(),
            risks: Array.isArray(validationReview?.risks) ? validationReview.risks : [],
            promptText: String(validationReview?.renderedPrompt || '').trim(),
            rawText: String(validationReview?.rawText || '').trim()
          }
        }
      });

      if (score > currentBaselineScore) {
        currentBaselinePrompt = promptText;
        currentBaselineScore = score;
        for (const row of resultRows) {
          if (normalizeIndicatorCode(row?.indicator_code) === group.indicatorCode) {
            row.improved_prompt = promptText;
            row.post_similarity = score;
            row.iteration = iteration;
          }
        }
      }

      if (targetScoreThreshold > 0 && score >= targetScoreThreshold) {
        emitProgress(onProgress, now, {
          status: 'stopped',
          phase: 'threshold_reached',
          round: iteration,
          totalRounds: maxIterations,
          indicatorCode: group.indicatorCode,
          indicatorName: group.indicatorName,
          score,
          threshold: targetScoreThreshold,
          completedPhases: completedPhaseCount,
          totalPhases: totalPhaseCount,
          percent: Math.round((completedPhaseCount / totalPhaseCount) * 100),
          message: `第 ${iteration} 轮达到目标阈值 ${targetScoreThreshold}，提前停止`
        });
        break;
      }
    }
  }

  const sortedCandidates = sortCandidatesByScore(candidates);
  const bestCandidateId = sortedCandidates[0]?.id || '';
  const firstGroup = groups[0] || null;
  const run = createOptimizationRun({
    assetId: String(input?.assetId || '').trim(),
    baselineVersionId: String(input?.baselineVersion?.id || '').trim(),
    datasetId: String(input?.datasetId || '').trim(),
    status: 'completed',
    targetName: String(input?.targetName || firstGroup?.indicatorName || '').trim(),
    indicatorCode: firstGroup?.indicatorCode || '',
    indicatorName: firstGroup?.indicatorName || '',
    modelName: String(input?.llmSettings?.modelName || '').trim(),
    providerType: String(input?.llmSettings?.providerType || '').trim(),
    baselineScore,
    baselinePromptText,
    bestCandidateId,
    candidates: sortedCandidates,
    traceEntries,
    strategySnapshot,
    rounds,
    resultRows,
    tokenStats: input?.tokenStats ?? null,
    createdAt: now(),
    updatedAt: now()
  }, { now });

  emitProgress(onProgress, now, {
    status: 'completed',
    phase: 'completed',
    round: run.rounds?.length || 0,
    totalRounds: maxIterations,
    completedPhases: completedPhaseCount,
    totalPhases: totalPhaseCount,
    percent: 100,
    message: '自动优化运行完成'
  });

  return {
    run,
    resultRows,
    traceEntries
  };
}
