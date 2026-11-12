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

test('runPromptIteration 非 Gemini provider 会提取 PDF 文本后运行', async () => {
  const llmCalls = [];

  const result = await runPromptIteration({
    name: '社会指标',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [{ id: 'a', file: { name: 'A.pdf' }, pageSpec: '' }],
    llmSettings: {
      apiUrl: 'https://api.openai.example.com/v1',
      apiKey: 'k',
      modelName: 'qwen3.8-flash',
      providerType: 'openai'
    }
  }, {
    parsePdfFile: async () => [{ pageNumber: 1, text: 'PDF 正文内容' }],
    fileToBase64: async () => 'FULL:BASE64',
    callLLMWithRetry: async (payload) => {
      llmCalls.push(payload);
      return { text: '{}', usage: { input_tokens: 1, output_tokens: 1 } };
    }
  });

  assert.equal(result.results[0].status, 'success');
  assert.equal(llmCalls.length, 1);
  assert.equal(llmCalls[0].pdfBase64, undefined);
  assert.match(llmCalls[0].userPrompt, /PDF 正文内容/);
});

test('runPromptIteration 文本文件可直接走纯文本模型', async () => {
  const llmCalls = [];

  const result = await runPromptIteration({
    name: '环保创新技术',
    systemPrompt: '只返回 JSON',
    userPrompt: '从输入内容中提取目标信息',
    files: [{ id: 'a', file: { name: 'notes.txt' }, type: 'text/plain' }],
    llmSettings: {
      apiUrl: 'https://api.openai.example.com/v1',
      apiKey: 'k',
      modelName: 'gpt-4.1',
      providerType: 'openai'
    }
  }, {
    readTextFile: async () => '这里是待提取的文本内容',
    callLLMWithRetry: async (payload) => {
      llmCalls.push(payload);
      return {
        text: '{"ok":true}',
        usage: { input_tokens: 9, output_tokens: 3 }
      };
    },
    now: () => 4000
  });

  assert.equal(result.results[0].status, 'success');
  assert.equal(result.results[0].scopeLabel, '全文文本');
  assert.equal(result.results[0].jsonParseStatus, 'success');
  assert.equal(llmCalls.length, 1);
  assert.equal(llmCalls[0].pdfBase64, undefined);
  assert.match(llmCalls[0].userPrompt, /提取目标：环保创新技术/);
  assert.match(llmCalls[0].userPrompt, /这里是待提取的文本内容/);
});

test('runPromptIteration 表格文件可转成文本上下文后运行', async () => {
  const llmCalls = [];

  const result = await runPromptIteration({
    name: '温室气体排放',
    systemPrompt: '只返回 JSON',
    userPrompt: '读取表格并提取目标信息',
    files: [{ id: 'sheet-1', file: { name: 'data.xlsx' }, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
    llmSettings: {
      apiUrl: 'https://api.openai.example.com/v1',
      apiKey: 'k',
      modelName: 'gpt-4.1',
      providerType: 'openai'
    }
  }, {
    parseSpreadsheetFile: async () => [
      { 指标: '温室气体排放', 数值: '123', 单位: '吨' },
      { 指标: '总能耗', 数值: '456', 单位: 'MWh' }
    ],
    callLLMWithRetry: async (payload) => {
      llmCalls.push(payload);
      return {
        text: '{"rows":1}',
        usage: { input_tokens: 11, output_tokens: 4 }
      };
    },
    now: () => 5000
  });

  assert.equal(result.results[0].status, 'success');
  assert.equal(result.results[0].scopeLabel, '整表');
  assert.equal(llmCalls.length, 1);
  assert.equal(llmCalls[0].pdfBase64, undefined);
  assert.match(llmCalls[0].userPrompt, /文件名：data\.xlsx/);
  assert.match(llmCalls[0].userPrompt, /温室气体排放/);
  assert.match(llmCalls[0].userPrompt, /总能耗/);
});

test('runPromptIteration docx 文件可转成文本上下文后运行', async () => {
  const llmCalls = [];

  const result = await runPromptIteration({
    name: '供应链管理',
    systemPrompt: '只返回 JSON',
    userPrompt: '读取文档并提取目标信息',
    files: [{ id: 'docx-1', file: { name: 'brief.docx' }, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
    llmSettings: {
      apiUrl: 'https://api.openai.example.com/v1',
      apiKey: 'k',
      modelName: 'gpt-4.1',
      providerType: 'openai'
    }
  }, {
    parseDocxFile: async () => '这是从 DOCX 中解析出的正文内容',
    callLLMWithRetry: async (payload) => {
      llmCalls.push(payload);
      return {
        text: '{"ok":true}',
        usage: { input_tokens: 10, output_tokens: 3 }
      };
    },
    now: () => 5500
  });

  assert.equal(result.results[0].status, 'success');
  assert.equal(result.results[0].scopeLabel, '全文文本');
  assert.equal(llmCalls.length, 1);
  assert.match(llmCalls[0].userPrompt, /brief\.docx/);
  assert.match(llmCalls[0].userPrompt, /DOCX/);
});

test('runPromptIteration 图片文件会通过 Gemini 多模态附件调用', async () => {
  const llmCalls = [];

  const result = await runPromptIteration({
    name: '绿色产品图表',
    systemPrompt: '只返回 JSON',
    userPrompt: '读取图片并提取目标信息',
    files: [{ id: 'img-1', file: { name: 'chart.png' }, type: 'image/png' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    fileToBase64: async () => 'IMG:BASE64',
    callLLMWithRetry: async (payload) => {
      llmCalls.push(payload);
      return {
        text: '{"ok":true}',
        usage: { input_tokens: 12, output_tokens: 4 }
      };
    },
    now: () => 5600
  });

  assert.equal(result.results[0].status, 'success');
  assert.equal(result.results[0].scopeLabel, '图片');
  assert.equal(llmCalls.length, 1);
  assert.equal(Array.isArray(llmCalls[0].pdfInputs), true);
  assert.equal(llmCalls[0].pdfInputs[0].mimeType, 'image/png');
  assert.equal(llmCalls[0].pdfInputs[0].data, 'IMG:BASE64');
});

test('supportsPromptIterationPdfProvider 支持声明 PDF 能力的公司预设', () => {
  assert.equal(supportsPromptIterationPdfProvider({
    providerType: 'company',
    serverManaged: true,
    supportsPdfUpload: true
  }), true);
  assert.equal(supportsPromptIterationPdfProvider({
    providerType: 'company',
    serverManaged: true,
    supportsPdfUpload: false
  }), false);
});

test('runPromptIteration 混合 PDF 和文本时 PDF 走文本提取，文本正常处理', async () => {
  const llmCalls = [];
  const result = await runPromptIteration({
    name: '混合输入',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [
      { id: 'a', file: { name: 'report.pdf' }, type: 'application/pdf' },
      { id: 'b', file: { name: 'notes.txt' }, type: 'text/plain' }
    ],
    llmSettings: {
      apiUrl: 'https://api.openai.example.com/v1',
      apiKey: 'k',
      modelName: 'qwen3.8-flash',
      providerType: 'openai'
    }
  }, {
    parsePdfFile: async () => [{ pageNumber: 1, text: 'PDF 文本' }],
    readTextFile: async () => '普通文本',
    callLLMWithRetry: async (payload) => {
      llmCalls.push(payload);
      return { text: '{}', usage: { input_tokens: 1, output_tokens: 1 } };
    }
  });

  assert.equal(result.results.length, 2);
  assert.equal(result.summary.successCount, 2);
  assert.match(llmCalls[0].userPrompt, /PDF 文本/);
  assert.match(llmCalls[1].userPrompt, /普通文本/);
});

test('runPromptIteration 图片输入仍要求模型支持多模态直传', async () => {
  await assert.rejects(
    () => runPromptIteration({
      name: '图片输入',
      systemPrompt: '只返回 JSON',
      userPrompt: '提取',
      files: [{ id: 'a', file: { name: 'scan.png' }, type: 'image/png' }],
      llmSettings: {
        apiUrl: 'https://api.openai.example.com/v1',
        apiKey: 'k',
        modelName: 'qwen3.8-flash',
        providerType: 'openai'
      }
    }),
    /图片输入需要模型支持多模态直传/
  );
});

test('supportsPromptIterationPdfProvider 放行 Gemini 与声明 PDF 能力的公司预设', () => {
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
  assert.equal(draft.inputSource, 'pdf');
  assert.equal(draft.promptAssetId, 'asset_1');
  assert.equal(draft.promptVersionId, 'pver_2');
  assert.equal(draft.promptIndicatorCode, 'E3');
  assert.equal(draft.files[0].pageSpec, '1-2');
  assert.equal(draft.files[0].type, 'application/pdf');
});

test('normalizePromptIterationDraft 保留输入源与非 PDF 文件类型', () => {
  const draft = normalizePromptIterationDraft({
    inputSource: 'text',
    files: [{ id: 'txt-1', name: 'notes.txt', type: 'text/plain' }]
  });

  assert.equal(draft.inputSource, 'text');
  assert.equal(draft.files[0].type, 'text/plain');
  assert.equal(draft.files[0].pageSpec, '');
});

test('normalizePromptIterationDraft 在显式要求时保留文件句柄', () => {
  const file = { name: 'A.pdf', arrayBuffer: async () => new ArrayBuffer(0) };
  const draft = normalizePromptIterationDraft({
    files: [{ id: 'pdf-1', name: 'A.pdf', type: 'application/pdf', pageSpec: '1', file }]
  }, { preserveFiles: true });

  assert.equal(draft.files[0].file, file);
});

test('PDF 直传失败后自动回退文本提取', async () => {
  const calls = [];
  let parseCalls = 0;
  const result = await runPromptIteration({
    name: '回退测试',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [{ id: 'a', file: { name: 'A.pdf' }, pageSpec: '' }],
    llmSettings: {
      apiUrl: 'https://api.openai.example.com/v1',
      apiKey: 'k',
      modelName: 'deepseek-v4.1',
      providerType: 'openai',
      supportsPdfUpload: true
    }
  }, {
    fileToBase64: async () => 'PDF_BASE64',
    parsePdfFile: async () => {
      parseCalls += 1;
      return [{ pageNumber: 1, text: '回退后的 PDF 文本' }];
    },
    callLLMWithRetry: async (payload) => {
      calls.push(payload);
      if (calls.length === 1) {
        throw new Error('OpenAI API Error: 400 - file input not supported');
      }
      return { text: '{}', usage: { input_tokens: 1, output_tokens: 1 } };
    }
  });

  assert.equal(parseCalls, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].pdfBase64, 'PDF_BASE64');
  assert.equal(calls[1].pdfBase64, undefined);
  assert.match(calls[1].userPrompt, /回退后的 PDF 文本/);
  assert.match(result.results[0].scopeLabel, /回退/);
  assert.equal(result.results[0].status, 'success');
});


test('快速迭代取消后不再开始文件队列', async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => runPromptIteration({
      name: '取消测试',
      systemPrompt: '只返回 JSON',
      userPrompt: '提取',
      signal: controller.signal,
      files: [{ id: 'a', file: { name: 'A.txt' }, type: 'text/plain' }],
      llmSettings: { apiUrl: 'https://api.openai.example.com/v1', apiKey: 'k', modelName: 'qwen', providerType: 'openai' }
    }),
    (error) => error?.name === 'AbortError'
  );
});

test('runPromptIteration 自动在 Prompt 中注入指标代码并在返回后自动回填规范化', async () => {
  let capturedPayload = null;

  const result = await runPromptIteration({
    promptIndicatorCode: '001001004',
    name: '环保总投入',
    promptValueType: '货币型',
    systemPrompt: '只返回 JSON',
    userPrompt: '企业在环境保护方面的总投入，不含罚款。',
    files: [{ id: 'f1', file: { name: 'byd.pdf' }, pageSpec: '' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    fileToBase64: async () => 'PDF_DATA',
    callLLMWithRetry: async (payload) => {
      capturedPayload = payload;
      // 模拟大模型输出：由于不知道 indicator_code 或缺失，输出为“未披露”
      return {
        text: JSON.stringify({
          results: [
            {
              indicator_code: '未披露',
              year: '2024',
              num_value: '14.1',
              unit: '亿元',
              currency: 'CNY',
              pdf_numbers: '35, 55'
            }
          ]
        }),
        usage: { input_tokens: 100, output_tokens: 50 }
      };
    },
    now: () => 1000
  });

  // 1. 验证发给模型的 Prompt 已包含指标代码与名称
  assert.match(capturedPayload.userPrompt, /提取目标：环保总投入/);
  assert.match(capturedPayload.userPrompt, /指标代码 \(Indicator Code\)：001001004/);
  assert.match(capturedPayload.userPrompt, /指标类型 \(Value Type\)：货币型/);

  // 2. 验证解析结果已自动校准回填真实代码与指标名称
  assert.equal(result.results.length, 1);
  const parsed = result.results[0].parsedJson;
  assert.equal(parsed.results[0].indicator_code, '001001004');
  assert.equal(parsed.results[0].indicator_name, '环保总投入');
  assert.equal(parsed.results[0].num_value, '14.1');
  assert.equal(parsed.results[0].unit, '亿元');
});

test('runPromptIteration 支持多指标合批并自动打包清单与安全归一化', async () => {
  let capturedPayload = null;

  const result = await runPromptIteration({
    promptValueType: '货币型',
    systemPrompt: '只返回 JSON',
    indicators: [
      { code: '001001004', name: '环保总投入', valueType: '货币型', userPrompt: '总投入直接数值' },
      { code: '001001008', name: '环保运营支出', valueType: '货币型', userPrompt: '日常运行支出' }
    ],
    files: [{ id: 'f1', file: { name: 'report.pdf' }, pageSpec: '' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    fileToBase64: async () => 'PDF_DATA',
    callLLMWithRetry: async (payload) => {
      capturedPayload = payload;
      return {
        text: JSON.stringify({
          results: [
            { indicator_code: '001001004', year: '2024', num_value: '14.1', unit: '亿元' },
            { indicator_name: '环保运营支出', year: '2024', num_value: '2.5', unit: '亿元' }
          ]
        }),
        usage: { input_tokens: 200, output_tokens: 80 }
      };
    },
    now: () => 1000
  });

  // 1. 验证发给模型的 Prompt 包含了指标清单和各自专属指令
  assert.match(capturedPayload.userPrompt, /待提取指标清单/);
  assert.match(capturedPayload.userPrompt, /001001004/);
  assert.match(capturedPayload.userPrompt, /环保总投入/);
  assert.match(capturedPayload.userPrompt, /总投入直接数值/);
  assert.match(capturedPayload.userPrompt, /001001008/);
  assert.match(capturedPayload.userPrompt, /日常运行支出/);

  // 2. 验证多指标返回结果双向匹配与名称/代码安全回填
  assert.equal(result.results.length, 1);
  const rows = result.results[0].parsedJson.results;
  assert.equal(rows.length, 2);
  // 指标1通过 code 补齐了 name
  assert.equal(rows[0].indicator_code, '001001004');
  assert.equal(rows[0].indicator_name, '环保总投入');
  assert.equal(rows[0].num_value, '14.1');
  // 指标2通过 name 反向补齐了 code
  assert.equal(rows[1].indicator_code, '001001008');
  assert.equal(rows[1].indicator_name, '环保运营支出');
  assert.equal(rows[1].num_value, '2.5');
});

test('I3 回归：合批时专属指令只在各自指标内出现，切换当前查看指标不改变最终请求', async () => {
  const indicators = [
    { code: 'QA-A', name: '排放量', valueType: '数值型', userPrompt: '仅提取2024年，不要提取用水量' },
    { code: 'QA-B', name: '用水量', valueType: '数值型', userPrompt: '仅提取2023年，不要提取排放量' }
  ];

  let promptViewingA = '';
  let promptViewingB = '';

  const mockDeps = {
    fileToBase64: async () => 'PDF_DATA',
    now: () => 1000
  };

  // 1. 模拟当前查看 A 时运行（userPrompt 传入 A 的专属指令）
  await runPromptIteration({
    systemPrompt: '通用系统提示词',
    userPrompt: '仅提取2024年，不要提取用水量',
    indicators,
    files: [{ id: 'f1', file: { name: 'test.pdf' }, pageSpec: '' }],
    llmSettings: { apiUrl: 'https://example.com', apiKey: 'k', modelName: 'm', providerType: 'gemini' }
  }, {
    ...mockDeps,
    callLLMWithRetry: async (payload) => {
      promptViewingA = payload.userPrompt;
      return { text: '{"results":[]}', usage: { input_tokens: 10, output_tokens: 10 } };
    }
  });

  // 2. 模拟当前查看 B 时运行（userPrompt 传入 B 的专属指令，指标集合与专属指令保持一致）
  await runPromptIteration({
    systemPrompt: '通用系统提示词',
    userPrompt: '仅提取2023年，不要提取排放量',
    indicators,
    files: [{ id: 'f1', file: { name: 'test.pdf' }, pageSpec: '' }],
    llmSettings: { apiUrl: 'https://example.com', apiKey: 'k', modelName: 'm', providerType: 'gemini' }
  }, {
    ...mockDeps,
    callLLMWithRetry: async (payload) => {
      promptViewingB = payload.userPrompt;
      return { text: '{"results":[]}', usage: { input_tokens: 10, output_tokens: 10 } };
    }
  });

  // 3. 验证：两次合批请求发送给模型的最终 Prompt 必须完全相同
  assert.equal(promptViewingA, promptViewingB);

  // 4. 验证：A 的限制仅作用于自身，B 的限制仅作用于自身，顶层绝无置顶单项指令
  assert.ok(promptViewingA.startsWith('【待提取指标清单 / Target Indicators】'));
  assert.match(promptViewingA, /指标代码：QA-A[\s\S]*?提取指令与业务规则：仅提取2024年，不要提取用水量/);
  assert.match(promptViewingA, /指标代码：QA-B[\s\S]*?提取指令与业务规则：仅提取2023年，不要提取排放量/);
});

test('I3 回归：单指标运行保持现有语义，专属 userPrompt 依然置于首段', async () => {
  let capturedPrompt = '';
  await runPromptIteration({
    systemPrompt: '通用系统提示词',
    userPrompt: '单指标专属提示词内容',
    name: '环保总投入',
    indicators: [
      { code: '001001004', name: '环保总投入', valueType: '货币型', userPrompt: '单指标专属提示词内容' }
    ],
    files: [{ id: 'f1', file: { name: 'test.pdf' }, pageSpec: '' }],
    llmSettings: { apiUrl: 'https://example.com', apiKey: 'k', modelName: 'm', providerType: 'gemini' }
  }, {
    fileToBase64: async () => 'PDF_DATA',
    callLLMWithRetry: async (payload) => {
      capturedPrompt = payload.userPrompt;
      return { text: '{"results":[]}', usage: { input_tokens: 10, output_tokens: 10 } };
    },
    now: () => 1000
  });

  // 单指标运行时，首段依然是用户的 userPrompt
  assert.ok(capturedPrompt.startsWith('单指标专属提示词内容'));
  assert.match(capturedPrompt, /提取目标：环保总投入/);
  assert.match(capturedPrompt, /指标代码 \(Indicator Code\)：001001004/);
});

test('F1 回归：合批中保存已有指标版本保留其余选中指标，新建指标则切换为新指标', () => {
  // 1. 模拟合批场景中保存已有指标 A
  const prevBatchDraft = {
    promptAssetId: 'asset_A',
    selectedPromptAssetIds: ['asset_A', 'asset_B'],
    activeAssetId: 'asset_A'
  };

  const isNewDraftA = false;
  const resultA = {
    asset: { id: 'asset_A', indicatorCode: 'QA-A', name: '指标A', valueType: '数值型' },
    version: { id: 'ver_A2' }
  };

  const nextSelectedIdsA = isNewDraftA
    ? [resultA.asset.id]
    : (Array.isArray(prevBatchDraft.selectedPromptAssetIds) && prevBatchDraft.selectedPromptAssetIds.length > 0
      ? prevBatchDraft.selectedPromptAssetIds
      : [resultA.asset.id]);

  const updatedDraftA = normalizePromptIterationDraft({
    ...prevBatchDraft,
    promptAssetId: resultA.asset.id,
    promptVersionId: resultA.version.id,
    activeAssetId: resultA.asset.id,
    selectedPromptAssetIds: nextSelectedIdsA,
    promptIndicatorCode: resultA.asset.indicatorCode,
    name: resultA.asset.name,
    promptValueType: resultA.asset.valueType
  });

  // 验证合批成员 ['asset_A', 'asset_B'] 完整保留，不丢失！
  assert.deepEqual(updatedDraftA.selectedPromptAssetIds, ['asset_A', 'asset_B']);

  // 2. 模拟从多选新增全新指标 C 并保存
  const isNewDraftC = true;
  const resultC = {
    asset: { id: 'asset_C', indicatorCode: 'QA-C', name: '指标C', valueType: '数值型' },
    version: { id: 'ver_C1' }
  };

  const nextSelectedIdsC = isNewDraftC
    ? [resultC.asset.id]
    : prevBatchDraft.selectedPromptAssetIds;

  const updatedDraftC = normalizePromptIterationDraft({
    ...prevBatchDraft,
    promptAssetId: resultC.asset.id,
    promptVersionId: resultC.version.id,
    activeAssetId: resultC.asset.id,
    selectedPromptAssetIds: nextSelectedIdsC,
    promptIndicatorCode: resultC.asset.indicatorCode,
    name: resultC.asset.name,
    promptValueType: resultC.asset.valueType
  });

  // 验证新建指标切换为独立单选 ['asset_C']
  assert.deepEqual(updatedDraftC.selectedPromptAssetIds, ['asset_C']);
  assert.equal(updatedDraftC.promptAssetId, 'asset_C');
});

test('F2 回归：跨类型切换与清空重选正确载入对应类型模板，实际请求无上一类型格式残留', async () => {
  let capturedPayload = null;

  // 模拟数值型执行
  await runPromptIteration({
    promptValueType: '数值型',
    systemPrompt: 'You are extracting 数值型指标, output num_value, unit',
    userPrompt: '提取数值',
    name: '排放量',
    indicators: [{ code: 'N1', name: '排放量', valueType: '数值型' }],
    files: [{ id: 'f1', file: { name: 'test.pdf' }, pageSpec: '' }],
    llmSettings: { apiUrl: 'https://example.com', apiKey: 'k', modelName: 'm', providerType: 'gemini' }
  }, {
    fileToBase64: async () => 'PDF_DATA',
    callLLMWithRetry: async (payload) => {
      capturedPayload = payload;
      return { text: '{"results":[]}', usage: { input_tokens: 10, output_tokens: 10 } };
    },
    now: () => 1000
  });

  assert.match(capturedPayload.sysPrompt, /数值型指标/);

  // 清空并重新选入文字型指标，系统提示词更新为文字型模板
  let textPayload = null;
  await runPromptIteration({
    promptValueType: '文字型',
    systemPrompt: 'You are extracting 文字型指标, output text_value only',
    userPrompt: '提取文字',
    name: '管理政策',
    indicators: [{ code: 'T1', name: '管理政策', valueType: '文字型' }],
    files: [{ id: 'f1', file: { name: 'test.pdf' }, pageSpec: '' }],
    llmSettings: { apiUrl: 'https://example.com', apiKey: 'k', modelName: 'm', providerType: 'gemini' }
  }, {
    fileToBase64: async () => 'PDF_DATA',
    callLLMWithRetry: async (payload) => {
      textPayload = payload;
      return { text: '{"results":[]}', usage: { input_tokens: 10, output_tokens: 10 } };
    },
    now: () => 1000
  });

  // 验证文字型请求中只有文字型指令，绝无残留的数值型输出要求
  assert.match(textPayload.sysPrompt, /文字型指标/);
  assert.doesNotMatch(textPayload.sysPrompt, /num_value/);
  assert.doesNotMatch(textPayload.userPrompt, /num_value/);
});
