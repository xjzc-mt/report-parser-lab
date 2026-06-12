import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_PROMPT_ASSET_OPTION_VALUE,
  buildPromptAssetSelectOptions,
  buildPromptTextStats,
  detectPromptIterationFileKind,
  extractJsonCandidate,
  parsePromptIterationPageSpec,
  summarizeParsedJson
} from '../src/utils/promptIterationModel.js';

test('buildPromptAssetSelectOptions 会把已应用的新 Prompt 草稿显示为待写入资产', () => {
  const options = buildPromptAssetSelectOptions([], {
    promptAssetId: '',
    promptIndicatorCode: '001001002',
    name: '环保创新技术'
  }, { includeDraft: true });

  assert.deepEqual(options, [
    {
      value: DRAFT_PROMPT_ASSET_OPTION_VALUE,
      label: '待写入 · 001001002 · 环保创新技术'
    }
  ]);
});

test('parsePromptIterationPageSpec 解析混合页码并去重排序', () => {
  assert.deepEqual(parsePromptIterationPageSpec('12-14,16,14,18'), {
    valid: true,
    pages: [12, 13, 14, 16, 18],
    normalized: '12-14,16,18',
    error: ''
  });
});

test('parsePromptIterationPageSpec 识别非法页码', () => {
  const result = parsePromptIterationPageSpec('12-a');
  assert.equal(result.valid, false);
  assert.match(result.error, /页码格式/);
});

test('parsePromptIterationPageSpec 严格拒绝字母尾缀页码片段', () => {
  assert.equal(parsePromptIterationPageSpec('12a').valid, false);
  assert.equal(parsePromptIterationPageSpec('1-3a').valid, false);
});

test('parsePromptIterationPageSpec 将空片段判为非法输入', () => {
  assert.equal(parsePromptIterationPageSpec('12,,15').valid, false);
  assert.equal(parsePromptIterationPageSpec('12,').valid, false);
  assert.equal(parsePromptIterationPageSpec(',12').valid, false);
});

test('buildPromptTextStats 分别统计系统提示词和用户提示词 token', () => {
  const stats = buildPromptTextStats({
    systemPrompt: '系统提示词',
    userPrompt: 'hello world'
  });

  assert.equal(stats.system.characters, 5);
  assert.equal(stats.user.characters, 11);
  assert.equal(stats.total.characters, 16);
  assert.equal(stats.total.estimatedTokens, stats.system.estimatedTokens + stats.user.estimatedTokens);
});

test('detectPromptIterationFileKind 按后缀和 MIME 识别 PDF、表格和文本文件', () => {
  assert.equal(detectPromptIterationFileKind({ name: 'report.pdf', type: 'application/pdf' }), 'pdf');
  assert.equal(detectPromptIterationFileKind({ name: 'data.xlsx', type: '' }), 'spreadsheet');
  assert.equal(detectPromptIterationFileKind({ name: 'data.csv', type: 'text/csv' }), 'spreadsheet');
  assert.equal(detectPromptIterationFileKind({ name: 'brief.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'text');
  assert.equal(detectPromptIterationFileKind({ name: 'chart.png', type: 'image/png' }), 'image');
  assert.equal(detectPromptIterationFileKind({ name: 'notes.md', type: 'text/markdown' }), 'text');
  assert.equal(detectPromptIterationFileKind({ name: 'rules.yaml', type: '' }), 'text');
  assert.equal(detectPromptIterationFileKind({ name: 'archive.zip', type: 'application/zip' }), 'unsupported');
});

test('extractJsonCandidate 优先解析完整 JSON，再回退到代码块 JSON', () => {
  assert.deepEqual(extractJsonCandidate('{"a":1}'), {
    status: 'success',
    parsed: { a: 1 },
    source: 'whole'
  });

  const fromFence = extractJsonCandidate('结果如下\n```json\n{"ok":true}\n```');
  assert.equal(fromFence.status, 'success');
  assert.deepEqual(fromFence.parsed, { ok: true });
  assert.equal(fromFence.source, 'fence');
});

test('extractJsonCandidate 只接受 JSON code fence 并继续查找后续合法 fence', () => {
  const result = extractJsonCandidate('结果如下\n```ts\nconst ok = true;\n```\n```json\n{"ok":true}\n```');

  assert.equal(result.status, 'success');
  assert.deepEqual(result.parsed, { ok: true });
  assert.equal(result.source, 'fence');
});

test('extractJsonCandidate 回退解析文本中的裸对象 JSON 片段', () => {
  const result = extractJsonCandidate('结果如下 {"ok":true}，请处理');

  assert.equal(result.status, 'success');
  assert.deepEqual(result.parsed, { ok: true });
  assert.equal(result.source, 'fragment');
});

test('extractJsonCandidate 回退解析文本中的裸数组 JSON 片段', () => {
  const result = extractJsonCandidate('结果如下 [1,2,3]，请处理');

  assert.equal(result.status, 'success');
  assert.deepEqual(result.parsed, [1, 2, 3]);
  assert.equal(result.source, 'fragment');
});

test('extractJsonCandidate 裸片段非法时返回 invalid 而不是 not_found', () => {
  const result = extractJsonCandidate('结果如下 {"ok":true，请处理');

  assert.equal(result.status, 'invalid');
  assert.equal(result.parsed, null);
  assert.equal(result.source, 'fragment');
});

test('summarizeParsedJson 对对象和数组生成完整 key 摘要', () => {
  assert.equal(
    summarizeParsedJson({ indicator_code: 'A', year: '2024', report_name: '报告A' }),
    '对象：indicator_code, year, report_name'
  );
  assert.equal(
    summarizeParsedJson([{ ok: true, name: 'a', count: 2 }, { ok: false }]),
    '数组：2 项，首项 key 为 ok, name, count'
  );
});
