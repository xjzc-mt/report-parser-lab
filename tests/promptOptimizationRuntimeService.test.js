import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOptimizationPdfInputs,
  runOptimizationDiagnosis,
  validateOptimizationCandidate
} from '../src/services/promptOptimizationRuntimeService.js';

test('buildOptimizationPdfInputs 会按诊断组合页切出带标签的 PDF 附件', async () => {
  const pdfInputs = await buildOptimizationPdfInputs({
    rows: [
      {
        report_name: 'A',
        pdf_numbers: '3',
        llm_pdf_numbers: '5'
      }
    ],
    pdfFiles: [
      { name: 'A.pdf' }
    ],
    windowRadius: 0
  }, {
    extractPdfPages: async (_file, pageNumbers) => ({
      pdfData: Uint8Array.from(pageNumbers)
    }),
    toBase64: (bytes) => `BASE64:${Array.from(bytes).join(',')}`
  });

  assert.equal(pdfInputs.length, 1);
  assert.equal(pdfInputs[0].mimeType, 'application/pdf');
  assert.equal(pdfInputs[0].data, 'BASE64:3,5');
  assert.equal(pdfInputs[0].label.includes('A'), true);
  assert.equal(pdfInputs[0].label.includes('3,5'), true);
});

test('runOptimizationDiagnosis 在 Gemini 下通过多模态 PDF 附件调用优化模型', async () => {
  const llmCalls = [];

  const diagnosis = await runOptimizationDiagnosis({
    indicatorCode: 'E1',
    indicatorName: '排放总量',
    baselinePrompt: '提取排放总量',
    rows: [
      {
        report_name: 'A',
        pdf_numbers: '3',
        llm_pdf_numbers: '5',
        similarity: 20,
        indicator_code: 'E1',
        indicator_name: '排放总量',
        text_value: '标准答案',
        llm_text_value: '旧结果'
      }
    ],
    pdfFiles: [
      { name: 'A.pdf' }
    ],
    llmSettings: {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'key',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    },
    strategy: {
      windowRadius: 0
    },
    extractPdfPages: async (_file, pageNumbers) => ({
      pdfData: Uint8Array.from(pageNumbers)
    }),
    toBase64: (bytes) => `BASE64:${Array.from(bytes).join(',')}`,
    callLLMWithRetry: async (params) => {
      llmCalls.push(params);
      return {
        text: JSON.stringify({
          summary: '页码和约束不够清晰',
          root_causes: ['页码范围不够准']
        }),
        usage: { input_tokens: 11, output_tokens: 7 }
      };
    }
  });

  assert.equal(llmCalls.length, 1);
  assert.equal(Array.isArray(llmCalls[0].pdfInputs), true);
  assert.equal(llmCalls[0].pdfInputs.length, 1);
  assert.equal(llmCalls[0].pdfInputs[0].data, 'BASE64:3,5');
  assert.equal(diagnosis.summary, '页码和约束不够清晰');
  assert.deepEqual(diagnosis.rootCauses, ['页码范围不够准']);
});

test('validateOptimizationCandidate 会把验证重跑 token 计入 extract 统计', async () => {
  const tokenStats = {
    optInput: 10,
    optOutput: 5,
    extractInput: 0,
    extractOutput: 0
  };

  const result = await validateOptimizationCandidate({
    promptText: '提取排放总量',
    diagnosis: {
      validationRows: [
        {
          report_name: 'A',
          pdf_numbers: '3',
          similarity: 20,
          indicator_code: 'E1',
          indicator_name: '排放总量',
          text_value: '标准答案',
          value_type: 'TEXT'
        }
      ]
    },
    pdfFiles: [
      { name: 'A.pdf' }
    ],
    llmSettings: {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'key',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    },
    tokenStats,
    extractPdfPages: async () => ({
      pdfData: Uint8Array.from([3])
    }),
    callLLMWithRetry: async () => ({
      text: JSON.stringify({
        results: [
          {
            indicator_code: 'E1',
            text_value: '标准答案'
          }
        ]
      }),
      usage: { input_tokens: 17, output_tokens: 6 }
    })
  });

  assert.equal(result.averageSimilarity, 100);
  assert.equal(tokenStats.optInput, 10);
  assert.equal(tokenStats.optOutput, 5);
  assert.equal(tokenStats.extractInput, 17);
  assert.equal(tokenStats.extractOutput, 6);
});
