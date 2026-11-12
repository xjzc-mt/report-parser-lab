import { estimateTextTokens } from './tokenEstimation.js';

export const DRAFT_PROMPT_ASSET_OPTION_VALUE = '__draft_prompt_asset__';

const SPREADSHEET_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml',
  'text/xml'
]);

const IMAGE_MIME_PREFIX = 'image/';

function normalizePromptAssetOptionText(value) {
  return String(value || '').trim();
}

export function detectPromptIterationFileKind(input) {
  const name = String(input?.name || input?.file?.name || '').trim().toLowerCase();
  const type = String(input?.type || input?.file?.type || '').trim().toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }

  if (
    SPREADSHEET_MIME_TYPES.has(type) ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv')
  ) {
    return 'spreadsheet';
  }

  if (
    TEXT_MIME_TYPES.has(type) ||
    (type.startsWith('text/') && type !== 'text/csv') ||
    name.endsWith('.docx') ||
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.json') ||
    name.endsWith('.yaml') ||
    name.endsWith('.yml') ||
    name.endsWith('.xml') ||
    name.endsWith('.html') ||
    name.endsWith('.htm') ||
    name.endsWith('.log')
  ) {
    return 'text';
  }

  if (
    type.startsWith(IMAGE_MIME_PREFIX) ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp') ||
    name.endsWith('.gif') ||
    name.endsWith('.bmp')
  ) {
    return 'image';
  }

  return 'unsupported';
}

export function buildPromptAssetSelectOptions(entries = [], draft = {}, options = {}) {
  const lockedValueType = String(options.lockedValueType || '').trim();
  const sortedEntries = [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const typeA = String(a?.asset?.valueType || '');
    const typeB = String(b?.asset?.valueType || '');
    if (typeA !== typeB) {
      return typeA.localeCompare(typeB);
    }
    const codeA = String(a?.asset?.indicatorCode || '');
    const codeB = String(b?.asset?.indicatorCode || '');
    return codeA.localeCompare(codeB);
  });

  const promptAssetOptions = sortedEntries.map((entry) => {
    const valueType = String(entry?.asset?.valueType || '文字型').trim();
    const isLockedOut = Boolean(lockedValueType && valueType !== lockedValueType);
    return {
      value: entry.asset.id,
      label: `[${valueType}] ${entry.asset.indicatorCode || '未编码'} · ${entry.asset.indicatorName || entry.asset.name || '未命名 Prompt'}`,
      valueType,
      disabled: isLockedOut,
      indicatorCode: entry.asset.indicatorCode || '',
      indicatorName: entry.asset.indicatorName || entry.asset.name || ''
    };
  });

  const shouldIncludeDraft = Boolean(options.includeDraft);
  const indicatorCode = normalizePromptAssetOptionText(draft.promptIndicatorCode);
  const indicatorName = normalizePromptAssetOptionText(draft.name);
  const hasPersistedAsset = Boolean(
    normalizePromptAssetOptionText(draft.promptAssetId) ||
    (Array.isArray(draft.selectedPromptAssetIds) && draft.selectedPromptAssetIds.length > 0)
  );

  if (!shouldIncludeDraft || hasPersistedAsset || !indicatorCode) {
    return promptAssetOptions;
  }

  return [
    {
      value: DRAFT_PROMPT_ASSET_OPTION_VALUE,
      label: `待写入 · ${indicatorCode} · ${indicatorName || '未命名 Prompt'}`
    },
    ...promptAssetOptions
  ];
}

function mergeTextTokenStats(...items) {
  return items.reduce((acc, item) => ({
    characters: acc.characters + item.characters,
    cjkCharacters: acc.cjkCharacters + item.cjkCharacters,
    nonCjkCharacters: acc.nonCjkCharacters + item.nonCjkCharacters,
    estimatedTokens: acc.estimatedTokens + item.estimatedTokens
  }), {
    characters: 0,
    cjkCharacters: 0,
    nonCjkCharacters: 0,
    estimatedTokens: 0
  });
}

export function buildPromptTextStats({ systemPrompt = '', userPrompt = '' } = {}) {
  const system = estimateTextTokens(systemPrompt);
  const user = estimateTextTokens(userPrompt);

  return {
    system,
    user,
    total: mergeTextTokenStats(system, user)
  };
}

function normalizePageList(pages) {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges = [];

  if (sorted.length === 0) {
    return { pages: sorted, normalized: '' };
  }

  let start = sorted[0];
  let prev = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === prev + 1) {
      prev = current;
      continue;
    }

    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    start = current;
    prev = current;
  }

  return {
    pages: sorted,
    normalized: ranges.join(',')
  };
}

function makeInvalidPageResult() {
  return {
    valid: false,
    pages: [],
    normalized: '',
    error: '页码格式不正确，请使用 12、12-15、12,15 这类格式。'
  };
}

function parseStrictPageToken(token) {
  if (!/^[1-9]\d*(?:-[1-9]\d*)?$/.test(token)) {
    return null;
  }

  const [startRaw, endRaw] = token.split('-');
  const start = Number(startRaw);
  const end = endRaw === undefined ? start : Number(endRaw);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
    return null;
  }

  return { start, end };
}

export function parsePromptIterationPageSpec(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { valid: true, pages: [], normalized: '', error: '' };
  }

  const pages = [];
  for (const chunk of raw.split(',')) {
    const part = chunk.trim();
    if (!part) {
      return makeInvalidPageResult();
    }

    const token = parseStrictPageToken(part);
    if (!token) {
      return makeInvalidPageResult();
    }

    for (let page = token.start; page <= token.end; page += 1) {
      pages.push(page);
    }
  }

  const normalized = normalizePageList(pages);
  return { valid: true, pages: normalized.pages, normalized: normalized.normalized, error: '' };
}

export function extractJsonCandidate(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return { status: 'not_found', parsed: null, source: 'none' };
  }

  try {
    return { status: 'success', parsed: JSON.parse(raw), source: 'whole' };
  } catch (_) {
    // ignore whole-text parse failure and continue to structured fallback
  }

  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let sawJsonFence = false;
  for (const match of raw.matchAll(fencePattern)) {
    const lang = match[1].trim().toLowerCase();
    if (lang !== 'json') {
      continue;
    }

    sawJsonFence = true;
    try {
      return { status: 'success', parsed: JSON.parse(match[2].trim()), source: 'fence' };
    } catch (_) {
      // keep scanning later json fences
    }
  }

  const fragmentCandidate = extractFirstJsonFragment(raw);
  if (fragmentCandidate !== null) {
    try {
      return { status: 'success', parsed: JSON.parse(fragmentCandidate), source: 'fragment' };
    } catch (_) {
      return { status: 'invalid', parsed: null, source: 'fragment' };
    }
  }

  if (sawJsonFence) {
    return { status: 'invalid', parsed: null, source: 'fence' };
  }

  return { status: 'not_found', parsed: null, source: 'none' };
}

function extractFirstJsonFragment(text) {
  const firstOpen = text.search(/[\[{]/);
  if (firstOpen === -1) {
    return null;
  }

  const open = text[firstOpen];
  const close = open === '{' ? '}' : ']';
  const stack = [close];
  let inString = false;
  let escaped = false;

  for (let index = firstOpen + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }

    if (char === '[') {
      stack.push(']');
      continue;
    }

    if (char === '}' || char === ']') {
      const expected = stack[stack.length - 1];
      if (char !== expected) {
        return text.slice(firstOpen);
      }

      stack.pop();
      if (stack.length === 0) {
        return text.slice(firstOpen, index + 1);
      }
    }
  }

  return text.slice(firstOpen);
}

export function summarizeParsedJson(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return `数组：${value.length} 项，首项 key 为 ${Object.keys(first).join(', ')}`;
    }
    return `数组：${value.length} 项`;
  }

  if (value && typeof value === 'object') {
    return `对象：${Object.keys(value).join(', ')}`;
  }

  return '基础类型';
}

const CANONICAL_COLUMN_META = {
  indicator_code: { label: '指标代码', priority: 10 },
  indicator_name: { label: '指标名称', priority: 20 },
  value_type: { label: '类型', priority: 30 },
  year: { label: '年份', priority: 40 },
  num_value: { label: '数值', priority: 50 },
  text_value: { label: '文字值', priority: 60 },
  unit: { label: '单位', priority: 70 },
  currency: { label: '币种', priority: 80 },
  numerator_unit: { label: '分子单位', priority: 90 },
  denominator_unit: { label: '分母单位', priority: 100 },
  pdf_numbers: { label: '出处页码', priority: 110 }
};

export function normalizeJsonToTableData(parsedJson) {
  if (!parsedJson || typeof parsedJson !== 'object') {
    return { canRenderTable: false, rows: [], columns: [] };
  }

  let rawList = [];
  if (Array.isArray(parsedJson)) {
    rawList = parsedJson;
  } else if (Array.isArray(parsedJson.results)) {
    rawList = parsedJson.results;
  } else if (Array.isArray(parsedJson.data)) {
    rawList = parsedJson.data;
  } else if (Array.isArray(parsedJson.items)) {
    rawList = parsedJson.items;
  } else if (Array.isArray(parsedJson.records)) {
    rawList = parsedJson.records;
  } else {
    const arrayVal = Object.values(parsedJson).find(
      (val) => Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null
    );
    if (arrayVal) {
      rawList = arrayVal;
    } else {
      rawList = [parsedJson];
    }
  }

  const rows = rawList
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return item;
      }
      if (item !== null && item !== undefined) {
        return { value: item };
      }
      return null;
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return { canRenderTable: false, rows: [], columns: [] };
  }

  const allKeys = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allKeys.add(key);
    }
  }

  if (allKeys.size === 0) {
    return { canRenderTable: false, rows: [], columns: [] };
  }

  const columns = Array.from(allKeys)
    .map((key) => {
      const meta = CANONICAL_COLUMN_META[key];
      return {
        key,
        label: meta?.label || key,
        priority: meta?.priority ?? 999
      };
    })
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));

  return {
    canRenderTable: true,
    rows,
    columns
  };
}

export function buildCandidateIndicators(input = {}) {
  if (Array.isArray(input.indicators) && input.indicators.length > 0) {
    return input.indicators.map((ind) => ({
      code: String(ind.code || ind.indicator_code || ind.indicatorCode || '').trim(),
      name: String(ind.name || ind.indicator_name || ind.indicatorName || '').trim(),
      valueType: String(ind.valueType || ind.value_type || ind.promptValueType || '').trim(),
      userPrompt: String(ind.userPrompt || ind.prompt || '').trim()
    })).filter((item) => item.code || item.name);
  }

  const code = String(input.promptIndicatorCode || '').trim();
  const name = String(input.name || '').trim();
  const valueType = String(input.promptValueType || input.valueType || '').trim();
  const userPrompt = String(input.userPrompt || '').trim();

  if (code || name) {
    return [{ code, name, valueType, userPrompt }];
  }

  return [];
}

export function normalizeIterationResultRow(row, candidateIndicators = []) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return row;
  }

  const normalized = { ...row };
  const currentCode = String(normalized.indicator_code || normalized.indicatorCode || normalized.code || '').trim();
  const currentName = String(normalized.indicator_name || normalized.indicatorName || normalized.name || '').trim();
  const isCodeMissingOrPlaceholder = !currentCode || currentCode === '未披露' || currentCode.toUpperCase() === 'NOT_FOUND' || currentCode.toLowerCase() === 'none';

  // 1. 单指标场景：100% 确定性回填
  if (candidateIndicators.length === 1) {
    const single = candidateIndicators[0];
    if (single.code && isCodeMissingOrPlaceholder) {
      normalized.indicator_code = single.code;
    } else if (currentCode && !normalized.indicator_code) {
      normalized.indicator_code = currentCode;
    }
    if (single.name && !currentName) {
      normalized.indicator_name = single.name;
    } else if (currentName && !normalized.indicator_name) {
      normalized.indicator_name = currentName;
    }
    if (single.valueType && !normalized.value_type) {
      normalized.value_type = single.valueType;
    }
    return normalized;
  }

  // 2. 多指标场景：分层安全查找，严禁盲目覆盖与模糊歧义抢先
  if (candidateIndicators.length > 1) {
    let matched = null;

    // 第一优先：代码精确匹配（不区分大小写）
    if (currentCode && !isCodeMissingOrPlaceholder) {
      const codeMatches = candidateIndicators.filter(
        (ind) => ind.code && ind.code.toLowerCase() === currentCode.toLowerCase()
      );
      if (codeMatches.length === 1) {
        matched = codeMatches[0];
      }
    }

    // 第二优先：名称完全精确匹配（忽略首尾空白，不区分大小写）
    if (!matched && currentName) {
      const exactNameMatches = candidateIndicators.filter(
        (ind) => ind.name && ind.name.trim().toLowerCase() === currentName.toLowerCase()
      );
      if (exactNameMatches.length === 1) {
        matched = exactNameMatches[0];
      }
    }

    // 第三优先：模糊包含匹配，严格限制在候选唯一且无冲突时才补全；若存在多个候选（有歧义）坚决保留缺失
    if (!matched && currentName) {
      const fuzzyMatches = candidateIndicators.filter(
        (ind) => ind.name && (currentName.includes(ind.name.trim()) || ind.name.trim().includes(currentName))
      );
      if (fuzzyMatches.length === 1) {
        matched = fuzzyMatches[0];
      }
      // 如果 fuzzyMatches.length > 1，存在多个候选包含匹配，有歧义，不强行填码，matched 保持 null
    }

    if (matched) {
      if (matched.code && isCodeMissingOrPlaceholder) {
        normalized.indicator_code = matched.code;
      }
      if (matched.name && !currentName) {
        normalized.indicator_name = matched.name;
      }
      if (matched.valueType && !normalized.value_type) {
        normalized.value_type = matched.valueType;
      }
    }
  }

  return normalized;
}

export function normalizeIterationParsedJson(parsed, candidateIndicators = []) {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(candidateIndicators) || candidateIndicators.length === 0) {
    return parsed;
  }

  if (Array.isArray(parsed)) {
    return parsed.map((item) => normalizeIterationResultRow(item, candidateIndicators));
  }

  const resultObj = { ...parsed };
  const arrayKeys = ['results', 'data', 'items', 'records'];
  for (const key of arrayKeys) {
    if (Array.isArray(resultObj[key])) {
      resultObj[key] = resultObj[key].map((item) => normalizeIterationResultRow(item, candidateIndicators));
      return resultObj;
    }
  }

  for (const [key, value] of Object.entries(resultObj)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      resultObj[key] = value.map((item) => normalizeIterationResultRow(item, candidateIndicators));
      return resultObj;
    }
  }

  return normalizeIterationResultRow(resultObj, candidateIndicators);
}
