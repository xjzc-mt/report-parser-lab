import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clipPromptIterationHistory,
  removePromptIterationHistoryAt,
  normalizePromptIterationDraft,
  supportsPromptIterationPdfProvider,
  runPromptIteration
} from '../src/services/promptIterationService.js';

test('runPromptIteration 对每个 PDF 独立执行并聚合结果', async () => {
  const extractCalls = [];
  const llmCalls = [];
  const result = await runPromptIteration({
    name: '温室气体排放',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取目标内容',
    files: [
      { id: 'a', file: { name: 'A.pdf' }, pageSpec: '1-2' },
      { id: 'b', file: { name: 'B.pdf' }, pageSpec: '' }
    ],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    extractPdfPages: async (_, pages) => {
      extractCalls.push(pages);
      return { pdfData: new Uint8Array([1, 2]), pageOffset: pages[0] };
    },
    fileToBase64: async (file) => `FULL:${file.name}`,
    uint8ArrayToBase64: () => 'BASE64',
    callLLMWithRetry: async (payload) => {
      llmCalls.push(payload);
      return {
        text: JSON.stringify({ prompt: payload.userPrompt }),
        usage: { input_tokens: 12, output_tokens: 6 }
      };
    },
    now: () => 1000
  });

  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].jsonParseStatus, 'success');
  assert.equal(result.summary.successCount, 2);
  assert.deepEqual(extractCalls, [[1, 2]]);
  assert.equal(llmCalls[0].pdfBase64, 'BASE64');
  assert.equal(llmCalls[1].pdfBase64, 'FULL:B.pdf');
  assert.match(llmCalls[0].userPrompt, /提取目标：温室气体排放/);
});

test('runPromptIteration 非 JSON 回复会标记未解析出 JSON', async () => {
  const result = await runPromptIteration({
    name: '废弃物',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [{ id: 'a', file: { name: 'A.pdf' }, pageSpec: '' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    fileToBase64: async () => 'FULL:BASE64',
    callLLMWithRetry: async () => ({
      text: 'plain text',
      usage: { input_tokens: 12, output_tokens: 6 }
    }),
    now: () => 1000
  });

  assert.equal(result.results[0].jsonParseStatus, 'not_found');
  assert.equal(result.results[0].summaryText, '未解析出 JSON');
});

test('runPromptIteration 会按文件上报可展示的运行进度', async () => {
  const progressMessages = [];

  const result = await runPromptIteration({
    name: '创新项目',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [
      { id: 'a', file: { name: 'A.pdf' }, pageSpec: '1' },
      { id: 'b', file: { name: 'B.pdf' }, pageSpec: '' }
    ],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    },
    onProgress: (entry) => progressMessages.push(entry)
  }, {
    extractPdfPages: async () => ({ pdfData: new Uint8Array([1]), pageOffset: 1 }),
    fileToBase64: async (file) => `FULL:${file.name}`,
    uint8ArrayToBase64: () => 'BASE64',
    callLLMWithRetry: async () => ({
      text: '{}',
      usage: { input_tokens: 1, output_tokens: 1 }
    }),
    now: () => 1000
  });

  assert.equal(result.summary.successCount, 2);
  assert.equal(progressMessages[0].percentage, 0);
  assert.equal(progressMessages.at(-1).percentage, 100);
  assert(progressMessages.some((entry) => entry.message.includes('正在截取页码')));
  assert(progressMessages.some((entry) => entry.message.includes('正在载入全文 PDF')));
  assert(progressMessages.some((entry) => entry.message.includes('Prompt 快速验证完成')));
});

test('runPromptIteration 单文件失败不阻断其他文件', async () => {
  let callCount = 0;
  const result = await runPromptIteration({
    name: '用水量',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [
      { id: 'a', file: { name: 'A.pdf' }, pageSpec: '1000' },
      { id: 'b', file: { name: 'B.pdf' }, pageSpec: '' }
    ],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    extractPdfPages: async () => {
      throw new Error('指定页码超出 PDF 范围');
    },
    fileToBase64: async () => 'FULL:BASE64',
    uint8ArrayToBase64: () => 'BASE64',
    callLLMWithRetry: async () => {
      callCount += 1;
      return { text: 'plain text', usage: { input_tokens: 1, output_tokens: 1 } };
    },
    now: () => 2000
  });

  assert.equal(result.results[0].status, 'error');
  assert.equal(result.results[1].status, 'success');
  assert.equal(callCount, 1);
});

test('runPromptIteration 缺失 file 时按单文件错误记录并继续后续文件', async () => {
  let callCount = 0;
  const result = await runPromptIteration({
    name: '社会指标',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [
      { id: 'a', pageSpec: '' },
      { id: 'b', file: { name: 'B.pdf' }, pageSpec: '' }
    ],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    fileToBase64: async () => 'FULL:BASE64',
    callLLMWithRetry: async () => {
      callCount += 1;
      return { text: '{}', usage: { input_tokens: 1, output_tokens: 1 } };
    },
    now: () => 3000
  });

  assert.equal(result.results[0].status, 'error');
  assert.match(result.results[0].errorMessage, /缺少 PDF 文件/);
  assert.equal(result.results[1].status, 'success');
  assert.equal(callCount, 1);
});

test('runPromptIteration 非 Gemini provider 会直接拒绝运行 PDF 实验', async () => {
  let llmCallCount = 0;

  await assert.rejects(
    () => runPromptIteration({
      name: '社会指标',
      systemPrompt: '只返回 JSON',
      userPrompt: '提取',
      files: [{ id: 'a', file: { name: 'A.pdf' }, pageSpec: '' }],
      llmSettings: {
        apiUrl: 'https://api.openai.example.com/v1',
        apiKey: 'k',
        modelName: 'gpt-4.1',
        providerType: 'openai'
      }
    }, {
      fileToBase64: async () => 'FULL:BASE64',
      callLLMWithRetry: async () => {
        llmCallCount += 1;
        return { text: '{}', usage: { input_tokens: 1, output_tokens: 1 } };
      }
    }),
    /仅支持 Gemini PDF 直传/
  );

  assert.equal(llmCallCount, 0);
});

test('supportsPromptIterationPdfProvider 仅放行 Gemini PDF 直传 provider', () => {
  assert.equal(
    supportsPromptIterationPdfProvider({
      providerType: 'gemini',
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta'
    }),
    true
  );

  assert.equal(
    supportsPromptIterationPdfProvider({
      providerType: 'anthropic',
      apiUrl: 'https://api.anthropic.com'
    }),
    false
  );

  assert.equal(
    supportsPromptIterationPdfProvider({
      providerType: '',
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta'
    }),
    true
  );
});

test('clipPromptIterationHistory 只保留最近 20 条历史', () => {
  const clipped = clipPromptIterationHistory(
    Array.from({ length: 25 }, (_, index) => ({ id: 25 - index })),
    20
  );

  assert.equal(clipped.length, 20);
  assert.deepEqual(clipped[0], { id: 25 });
});

test('removePromptIterationHistoryAt 按索引删除历史记录且不修改原数组', () => {
  const history = [
    { createdAt: 1000, name: 'A' },
    { createdAt: 2000, name: 'B' },
    { createdAt: 3000, name: 'C' }
  ];

  const nextHistory = removePromptIterationHistoryAt(history, 1);

  assert.deepEqual(nextHistory, [
    { createdAt: 1000, name: 'A' },
    { createdAt: 3000, name: 'C' }
  ]);
  assert.equal(history.length, 3);
  assert.deepEqual(removePromptIterationHistoryAt(history, -1), history);
  assert.notEqual(removePromptIterationHistoryAt(history, -1), history);
});

test('normalizePromptIterationDraft 用默认值补齐草稿', () => {
  const draft = normalizePromptIterationDraft({
    name: '范围三',
    promptAssetId: 'asset_1',
    promptVersionId: 'pver_2',
    promptIndicatorCode: 'E3',
    files: [{ id: 'a', pageSpec: '1-2' }]
  });

  assert.equal(draft.systemPrompt, '');
  assert.equal(draft.userPrompt, '');
  assert.equal(draft.promptAssetId, 'asset_1');
  assert.equal(draft.promptVersionId, 'pver_2');
  assert.equal(draft.promptIndicatorCode, 'E3');
  assert.equal(draft.files[0].pageSpec, '1-2');
  assert.equal(draft.files[0].type, 'application/pdf');
});
