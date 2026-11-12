import test from 'node:test';
import assert from 'node:assert/strict';

import { runPromptOptimizationEngine } from '../src/services/promptOptimizationEngine.js';

test('优化引擎会返回 baseline、候选与轨迹', async () => {
  const result = await runPromptOptimizationEngine({
    assetId: 'asset_1',
    baselineVersion: {
      id: 'pver_1',
      userPromptTemplate: '提取温室气体排放'
    },
    comparisonRows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        prompt: '提取温室气体排放',
        similarity: 40,
        report_name: 'A',
        pdf_numbers: '1'
      }
    ],
    pdfFiles: [{ name: 'A.pdf' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'm',
      providerType: 'gemini',
      maxOptIterations: 1
    }
  }, {
    now: () => 1000,
    callOptimizer: async () => ({
      improvedPrompt: '只返回排放总量 JSON',
      usage: { input_tokens: 1, output_tokens: 1 }
    }),
    validateCandidate: async () => ({
      averageSimilarity: 82,
      sampleResults: [{ report_name: 'A', similarity: 82, text: '123' }]
    })
  });

  assert.equal(result.run.baselineScore, 40);
  assert.equal(result.run.bestCandidateId, 'cand_E1_1');
  assert.equal(result.run.candidates.length, 1);
  assert.equal(result.run.candidates[0].promptText, '只返回排放总量 JSON');
  assert.equal(result.run.traceEntries.length, 4);
  assert.equal(result.run.baselinePromptText, '提取温室气体排放');
  assert.equal(result.resultRows[0].improved_prompt, '只返回排放总量 JSON');
});

test('候选分数未提升时不会回写 improved_prompt', async () => {
  const result = await runPromptOptimizationEngine({
    assetId: 'asset_1',
    baselineVersion: {
      id: 'pver_1',
      userPromptTemplate: '提取温室气体排放'
    },
    comparisonRows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        prompt: '提取温室气体排放',
        similarity: 70,
        report_name: 'A',
        pdf_numbers: '1'
      }
    ],
    pdfFiles: [{ name: 'A.pdf' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'm',
      providerType: 'gemini',
      maxOptIterations: 1
    }
  }, {
    now: () => 1000,
    callOptimizer: async () => ({
      improvedPrompt: '严格输出 JSON',
      usage: { input_tokens: 1, output_tokens: 1 }
    }),
    validateCandidate: async () => ({
      averageSimilarity: 65,
      sampleResults: [{ report_name: 'A', similarity: 65, text: '123' }]
    })
  });

  assert.equal(result.run.bestCandidateId, 'cand_E1_1');
  assert.equal(result.resultRows[0].improved_prompt, undefined);
  assert.equal(result.resultRows[0].post_similarity, undefined);
});

test('优化引擎会记录策略快照与每轮流水线结果', async () => {
  const result = await runPromptOptimizationEngine({
    assetId: 'asset_1',
    baselineVersion: {
      id: 'pver_1',
      userPromptTemplate: '提取温室气体排放'
    },
    comparisonRows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        prompt: '提取温室气体排放',
        similarity: 40,
        report_name: 'A',
        pdf_numbers: '1'
      }
    ],
    pdfFiles: [{ name: 'A.pdf' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'm',
      providerType: 'gemini',
      maxOptIterations: 1
    },
    strategy: {
      diagnosisUserTemplate: '诊断模板',
      candidateUserTemplate: '生成模板',
      validationUserTemplate: '验证模板'
    }
  }, {
    now: () => 1000,
    runDiagnosis: async () => ({
      summary: '问题在于页码和约束不够清晰',
      rawText: '{"summary":"问题在于页码和约束不够清晰"}'
    }),
    generateCandidate: async () => ({
      promptText: '只返回排放总量，未披露则返回未披露',
      rawText: '{"improved_prompt":"只返回排放总量，未披露则返回未披露"}'
    }),
    validateCandidate: async () => ({
      averageSimilarity: 84,
      sampleResults: [{ report_name: 'A', similarity: 84, text: '123' }]
    }),
    reviewValidation: async () => ({
      decision: 'accept',
      summary: '候选 Prompt 在验证集中明显提升',
      rawText: '{"decision":"accept","summary":"候选 Prompt 在验证集中明显提升"}'
    })
  });

  assert.equal(result.run.strategySnapshot.diagnosisUserTemplate, '诊断模板');
  assert.equal(result.run.rounds.length, 1);
  assert.equal(result.run.rounds[0].diagnosis.summary, '问题在于页码和约束不够清晰');
  assert.equal(result.run.rounds[0].candidate.promptText, '只返回排放总量，未披露则返回未披露');
  assert.equal(result.run.rounds[0].validation.review.summary, '候选 Prompt 在验证集中明显提升');
  assert.equal(result.run.traceEntries.some((entry) => entry.phase === 'diagnosis'), true);
  assert.equal(result.run.traceEntries.some((entry) => entry.phase === 'validation_review'), true);
});

test('优化引擎达到目标阈值后会提前停止并上报进度', async () => {
  const progressEvents = [];
  let validationCalls = 0;

  const result = await runPromptOptimizationEngine({
    assetId: 'asset_1',
    baselineVersion: {
      id: 'pver_1',
      userPromptTemplate: '提取温室气体排放'
    },
    comparisonRows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        prompt: '提取温室气体排放',
        similarity: 40,
        report_name: 'A',
        pdf_numbers: '1'
      }
    ],
    pdfFiles: [{ name: 'A.pdf' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'm',
      providerType: 'gemini',
      maxOptIterations: 3,
      targetScoreThreshold: 80
    }
  }, {
    now: () => 1000,
    onProgress: (event) => {
      progressEvents.push(event);
    },
    callOptimizer: async () => ({
      improvedPrompt: '只返回排放总量 JSON',
      usage: { input_tokens: 1, output_tokens: 1 }
    }),
    validateCandidate: async () => {
      validationCalls += 1;
      return {
        averageSimilarity: 82,
        sampleResults: [{ report_name: 'A', similarity: 82, text: '123' }]
      };
    }
  });

  assert.equal(validationCalls, 1);
  assert.equal(result.run.rounds.length, 1);
  assert.equal(progressEvents.some((event) => event.phase === 'diagnosis' && event.status === 'running'), true);
  assert.equal(progressEvents.some((event) => event.phase === 'threshold_reached' && event.status === 'stopped'), true);
  assert.equal(progressEvents.at(-1)?.phase, 'completed');
  assert.equal(progressEvents.at(-1)?.status, 'completed');
});

test('优化引擎在运行前已取消时不调用候选生成', async () => {
  const controller = new AbortController();
  controller.abort();
  let callCount = 0;

  await assert.rejects(
    () => runPromptOptimizationEngine({
      assetId: 'asset_1',
      baselineVersion: { id: 'pver_1', userPromptTemplate: '提取温室气体排放' },
      comparisonRows: [
        { indicator_code: 'E1', indicator_name: '排放总量', prompt: '提取', similarity: 40 }
      ],
      pdfFiles: [],
      llmSettings: { maxOptIterations: 1 },
      signal: controller.signal
    }, {
      callOptimizer: async () => {
        callCount += 1;
        return { improvedPrompt: 'x' };
      },
      validateCandidate: async () => {
        callCount += 1;
        return { averageSimilarity: 100 };
      }
    }),
    (error) => error.name === 'AbortError'
  );
  assert.equal(callCount, 0);
});
