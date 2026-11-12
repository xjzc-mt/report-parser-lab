import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_PROMPT_ASSET_OPTION_VALUE,
  buildCandidateIndicators,
  buildPromptAssetSelectOptions,
  buildPromptTextStats,
  detectPromptIterationFileKind,
  extractJsonCandidate,
  normalizeIterationParsedJson,
  normalizeIterationResultRow,
  normalizeJsonToTableData,
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

test('normalizeJsonToTableData 兼容文字型/数值型/货币型/强度型及多行提取结构', () => {
  // 1. 货币型（匹配用户提问截图样例）
  const currencyResult = normalizeJsonToTableData({
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
  });
  assert.equal(currencyResult.canRenderTable, true);
  assert.equal(currencyResult.rows.length, 1);
  assert.deepEqual(
    currencyResult.columns.map((c) => c.key),
    ['indicator_code', 'year', 'num_value', 'unit', 'currency', 'pdf_numbers']
  );
  assert.equal(currencyResult.columns.find((c) => c.key === 'currency').label, '币种');

  // 2. 文字型
  const textResult = normalizeJsonToTableData({
    results: [
      {
        indicator_code: '001001001',
        year: '2024',
        text_value: '取得 ISO 14001 认证证书',
        pdf_numbers: '12'
      }
    ]
  });
  assert.equal(textResult.canRenderTable, true);
  assert.deepEqual(
    textResult.columns.map((c) => c.key),
    ['indicator_code', 'year', 'text_value', 'pdf_numbers']
  );

  // 3. 强度型
  const intensityResult = normalizeJsonToTableData({
    results: [
      {
        indicator_code: '001002045',
        year: '2024',
        num_value: '0.85',
        unit: 'tCO2/万元',
        numerator_unit: 'tCO2',
        denominator_unit: '万元',
        pdf_numbers: '19'
      }
    ]
  });
  assert.equal(intensityResult.canRenderTable, true);
  assert.deepEqual(
    intensityResult.columns.map((c) => c.key),
    ['indicator_code', 'year', 'num_value', 'unit', 'numerator_unit', 'denominator_unit', 'pdf_numbers']
  );

  // 4. 多年份行数据与直接数组
  const multiYearResult = normalizeJsonToTableData([
    { year: '2024', num_value: '100', unit: '吨' },
    { year: '2023', num_value: '95', unit: '吨' }
  ]);
  assert.equal(multiYearResult.canRenderTable, true);
  assert.equal(multiYearResult.rows.length, 2);

  // 5. 非对象或非法结构安全回退
  assert.equal(normalizeJsonToTableData(null).canRenderTable, false);
  assert.equal(normalizeJsonToTableData('string').canRenderTable, false);
  assert.equal(normalizeJsonToTableData({ results: [] }).canRenderTable, false);
});

test('buildCandidateIndicators 正确提取单指标与多指标候选列表', () => {
  // 单指标输入
  const single = buildCandidateIndicators({
    promptIndicatorCode: '001001004',
    name: '环保总投入',
    promptValueType: '货币型'
  });
  assert.deepEqual(single, [{ code: '001001004', name: '环保总投入', valueType: '货币型', userPrompt: '' }]);

  // 多指标输入
  const multiple = buildCandidateIndicators({
    indicators: [
      { indicator_code: '001001004', indicator_name: '环保总投入', value_type: '货币型', userPrompt: '投入指令' },
      { indicator_code: '001001005', indicator_name: '温室气体排放', value_type: '数值型' }
    ]
  });
  assert.equal(multiple.length, 2);
  assert.equal(multiple[0].code, '001001004');
  assert.equal(multiple[0].userPrompt, '投入指令');
  assert.equal(multiple[1].name, '温室气体排放');
});

test('buildPromptAssetSelectOptions 支持指标类型分组并锁定同类型合批', () => {
  const entries = [
    { asset: { id: 'a1', indicatorCode: '001', indicatorName: '指标A', valueType: '货币型' } },
    { asset: { id: 'a2', indicatorCode: '002', indicatorName: '指标B', valueType: '货币型' } },
    { asset: { id: 'a3', indicatorCode: '003', indicatorName: '指标C', valueType: '文字型' } }
  ];

  // 1. 无锁定类型时，全部可选，带有类型前缀并按类型自然排序
  const allOptions = buildPromptAssetSelectOptions(entries);
  assert.equal(allOptions.length, 3);
  assert.equal(allOptions[0].label, '[文字型] 003 · 指标C');
  assert.equal(allOptions[0].disabled, false);
  assert.equal(allOptions[1].label, '[货币型] 001 · 指标A');
  assert.equal(allOptions[1].disabled, false);

  // 2. 锁定“货币型”时，非货币型的选项 disabled 为 true
  const lockedOptions = buildPromptAssetSelectOptions(entries, {}, { lockedValueType: '货币型' });
  const optionC = lockedOptions.find((opt) => opt.value === 'a3');
  const optionA = lockedOptions.find((opt) => opt.value === 'a1');
  assert.equal(optionA.disabled, false);
  assert.equal(optionC.disabled, true);
});

test('normalizeIterationResultRow 在单指标场景下安全回填代码、名称与类型', () => {
  const candidate = [{ code: '001001004', name: '环保总投入', valueType: '货币型' }];

  // 1. 模型返回了“未披露”，安全回填代码与名称
  const rowWithPlaceholder = {
    indicator_code: '未披露',
    year: '2024',
    num_value: '14.1',
    unit: '亿元'
  };
  const normalized1 = normalizeIterationResultRow(rowWithPlaceholder, candidate);
  assert.equal(normalized1.indicator_code, '001001004');
  assert.equal(normalized1.indicator_name, '环保总投入');
  assert.equal(normalized1.value_type, '货币型');

  // 2. 模型已正确输出代码，补充缺失的名称
  const rowWithCode = {
    indicator_code: '001001004',
    year: '2024',
    num_value: '14.1'
  };
  const normalized2 = normalizeIterationResultRow(rowWithCode, candidate);
  assert.equal(normalized2.indicator_code, '001001004');
  assert.equal(normalized2.indicator_name, '环保总投入');
});

test('normalizeIterationResultRow 在多指标场景下严格防冲突，不盲目覆盖未匹配行', () => {
  const candidates = [
    { code: '001001004', name: '环保总投入', valueType: '货币型' },
    { code: '001001005', name: '温室气体排放', valueType: '数值型' }
  ];

  // 1. 通过代码精准匹配指标 A，安全补充指标 A 的名称，不影响指标 B
  const rowA = { indicator_code: '001001004', num_value: '14.1' };
  const normalizedA = normalizeIterationResultRow(rowA, candidates);
  assert.equal(normalizedA.indicator_code, '001001004');
  assert.equal(normalizedA.indicator_name, '环保总投入');

  // 2. 通过名称精准匹配指标 B，反向补充指标 B 的代码
  const rowB = { indicator_name: '温室气体排放', num_value: '200' };
  const normalizedB = normalizeIterationResultRow(rowB, candidates);
  assert.equal(normalizedB.indicator_code, '001001005');
  assert.equal(normalizedB.indicator_name, '温室气体排放');

  // 3. 冲突保护：代码为“未披露”且名称为空，无法确定归属时保持原样，绝不盲目归属
  const unknownRow = { indicator_code: '未披露', num_value: '99' };
  const normalizedUnknown = normalizeIterationResultRow(unknownRow, candidates);
  assert.equal(normalizedUnknown.indicator_code, '未披露');
  assert.equal(normalizedUnknown.indicator_name, undefined);
});

test('normalizeIterationParsedJson 对嵌套 results 结构和裸数组均能安全规范化', () => {
  const candidate = [{ code: '001001004', name: '环保总投入', valueType: '货币型' }];
  const parsed = {
    results: [
      {
        indicator_code: '未披露',
        year: '2024',
        num_value: '14.1',
        unit: '亿元'
      }
    ]
  };

  const normalized = normalizeIterationParsedJson(parsed, candidate);
  assert.equal(normalized.results[0].indicator_code, '001001004');
  assert.equal(normalized.results[0].indicator_name, '环保总投入');

  // 表格展示检查：生成的表格应同时包含指标代码与指标名称
  const tableData = normalizeJsonToTableData(normalized);
  assert.equal(tableData.canRenderTable, true);
  const columnKeys = tableData.columns.map((c) => c.key);
  assert.ok(columnKeys.includes('indicator_code'));
  assert.ok(columnKeys.includes('indicator_name'));
  assert.equal(tableData.columns[0].key, 'indicator_code');
  assert.equal(tableData.columns[1].key, 'indicator_name');
});

test('I2 回归：名称包含关系时精确匹配优先，调换顺序保持一致；有歧义时不强行填码', () => {
  const candidatesA = [
    { code: 'TOTAL', name: '温室气体排放量', valueType: '数值型' },
    { code: 'DIRECT', name: '直接温室气体排放量', valueType: '数值型' }
  ];

  // 1. 模型返回“直接温室气体排放量”（无代码），应精确匹配 DIRECT，不能被 TOTAL 截胡
  const row1 = { indicator_name: '直接温室气体排放量', num_value: 42, unit: 't' };
  const normalized1 = normalizeIterationResultRow(row1, candidatesA);
  assert.equal(normalized1.indicator_code, 'DIRECT');
  assert.equal(normalized1.indicator_name, '直接温室气体排放量');

  // 2. 调换候选指标顺序，DIRECT 在前，TOTAL 在后，结果保持一致
  const candidatesB = [
    { code: 'DIRECT', name: '直接温室气体排放量', valueType: '数值型' },
    { code: 'TOTAL', name: '温室气体排放量', valueType: '数值型' }
  ];
  const normalized2 = normalizeIterationResultRow(row1, candidatesB);
  assert.equal(normalized2.indicator_code, 'DIRECT');
  assert.equal(normalized2.indicator_name, '直接温室气体排放量');

  // 3. 歧义保护：模型返回“温室气体”（模糊匹配同时包含 TOTAL 和 DIRECT），歧义时不填码，保留缺失
  const ambiguousRow = { indicator_name: '温室气体', num_value: 100 };
  const normalized3 = normalizeIterationResultRow(ambiguousRow, candidatesA);
  assert.equal(normalized3.indicator_code, undefined);
  assert.equal(normalized3.indicator_name, '温室气体');
});
