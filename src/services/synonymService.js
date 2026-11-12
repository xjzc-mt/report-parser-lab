// 同义词映射服务
let synonymMap = new Map();
let conversionMap = new Map();

function linkSynonymPair(left, right) {
  if (!left || !right || left === right) return;
  if (!synonymMap.has(left)) synonymMap.set(left, new Set());
  if (!synonymMap.has(right)) synonymMap.set(right, new Set());
  synonymMap.get(left).add(right);
  synonymMap.get(right).add(left);
}

function expandTermAliases(term) {
  const raw = String(term || '').trim();
  if (!raw) return [];

  const aliases = new Set([raw]);
  const bracketMatch = raw.match(/^(.*?)[(（]([^()（）]+)[)）]\s*$/);
  if (bracketMatch) {
    const base = String(bracketMatch[1] || '').trim();
    const inner = String(bracketMatch[2] || '').trim();
    if (base) aliases.add(base);
    if (inner) aliases.add(inner);
  }

  return Array.from(aliases);
}

/**
 * 加载同义词映射表
 * @param {Array<{term1: string, term2: string}>} rows - Excel 解析后的行数据
 */
export function loadSynonyms(rows) {
  synonymMap.clear();
  for (const row of rows) {
    const t1 = String(row.term1 || '').trim();
    const t2 = String(row.term2 || '').trim();
    if (!t1 || !t2) continue;
    const aliases1 = expandTermAliases(t1);
    const aliases2 = expandTermAliases(t2);

    for (const left of aliases1) {
      for (const right of aliases2) {
        linkSynonymPair(left, right);
      }
    }

    for (let index = 0; index < aliases1.length; index += 1) {
      for (let cursor = index + 1; cursor < aliases1.length; cursor += 1) {
        linkSynonymPair(aliases1[index], aliases1[cursor]);
      }
    }

    for (let index = 0; index < aliases2.length; index += 1) {
      for (let cursor = index + 1; cursor < aliases2.length; cursor += 1) {
        linkSynonymPair(aliases2[index], aliases2[cursor]);
      }
    }
  }
}

/**
 * 加载单位换算表
 * 约定：raw_value * unit_conversion = standard_value
 * @param {Array<{raw_unit: string, standard_unit: string, unit_conversion: number|string}>} rows
 */
export function loadConversions(rows) {
  conversionMap.clear();
  for (const row of rows) {
    const rawUnit = String(row.raw_unit || '').trim();
    const standardUnit = String(row.standard_unit || '').trim();
    const factor = Number(row.unit_conversion);
    if (!rawUnit || !standardUnit || !Number.isFinite(factor) || factor <= 0) continue;
    conversionMap.set(`${rawUnit}|||${standardUnit}`, factor);
  }
}

function normalizeNumericString(value) {
  return String(value ?? '')
    .trim()
    .replace(/[,\uFF0C\u00A0\u202F\s']/g, '');
}

function parseNumericValue(value) {
  const normalized = normalizeNumericString(value);
  // 只接受完整数值串，避免把 100-200 这类区间截断成 100。
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getUnitConversionFactor(fromUnit, toUnit) {
  const from = String(fromUnit || '').trim();
  const to = String(toUnit || '').trim();
  if (!from || !to) return null;
  if (from === to) return 1;
  return conversionMap.get(`${from}|||${to}`) ?? null;
}

function nearlyEqual(left, right) {
  const diff = Math.abs(left - right);
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return diff <= Math.max(1e-9, scale * 1e-9);
}

function compareNumericWithUnits(leftValue, rightValue, leftUnit, rightUnit) {
  const left = parseNumericValue(leftValue);
  const right = parseNumericValue(rightValue);
  if (left === null || right === null) return false;
  const normalizedLeftUnit = String(leftUnit || '').trim();
  const normalizedRightUnit = String(rightUnit || '').trim();

  if (!normalizedLeftUnit || !normalizedRightUnit) {
    if (nearlyEqual(left, right)) return true;
  } else if (normalizedLeftUnit === normalizedRightUnit || areSynonyms(normalizedLeftUnit, normalizedRightUnit)) {
    if (nearlyEqual(left, right)) return true;
  }

  const directFactor = getUnitConversionFactor(normalizedLeftUnit, normalizedRightUnit);
  if (directFactor !== null && nearlyEqual(left * directFactor, right)) return true;

  const reverseFactor = getUnitConversionFactor(normalizedRightUnit, normalizedLeftUnit);
  if (reverseFactor !== null && nearlyEqual(right * reverseFactor, left)) return true;

  return false;
}

export function areNumericValuesEquivalentWithUnits(leftValue, rightValue, leftUnit, rightUnit) {
  return compareNumericWithUnits(leftValue, rightValue, leftUnit, rightUnit);
}

export async function initializeSimilarityAssets(parseExcel) {
  const loadWorkbook = async (url, name) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`无法加载 ${name}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return parseExcel(new File([arrayBuffer], name));
  };

  const [synonymRows, conversionRows] = await Promise.all([
    loadWorkbook('/synonyms.xlsx', 'synonyms.xlsx').catch(() => []),
    loadWorkbook('/conversion.xlsx', 'conversion.xlsx').catch(() => [])
  ]);

  loadSynonyms(synonymRows);
  loadConversions(conversionRows);
}

/**
 * 判断两个词是否为同义词
 */
export function areSynonyms(str1, str2) {
  if (!str1 || !str2) return false;
  const s1 = String(str1).trim();
  const s2 = String(str2).trim();
  if (s1 === s2) return true;

  const syns = synonymMap.get(s1);
  return syns ? syns.has(s2) : false;
}

/**
 * 计算字段相似度（0-100）
 * @param {boolean} useLlmBased - 仅对 text 类型生效，使用 LLM 评估的相似度
 */
export function calculateFieldSimilarity(val1, val2, fieldType = 'text', useLlmBased = false, llmSim = null, options = {}) {
  const v1 = String(val1 ?? '').trim();
  const v2 = String(val2 ?? '').trim();

  if (!v1 || !v2 || v1 === '未披露' || v2 === '未披露') return 0;

  // 数值型先完成数值解析和单位归一化，再做字符串相等判断；
  // 否则 1 吨 / 1 千吨 会被原始字符串相等提前判成 100。
  if (fieldType === 'numeric') {
    const n1 = parseNumericValue(v1);
    const n2 = parseNumericValue(v2);
    if (n1 !== null && n2 !== null) {
      if (compareNumericWithUnits(n1, n2, options.leftUnit, options.rightUnit)) return 100;
    }
    return 0;
  }

  if (v1 === v2) return 100;

  // 页码、单位等：精确匹配或同义词，只返回0或100
  if (fieldType === 'exact') {
    return areSynonyms(v1, v2) ? 100 : 0;
  }

  // 文本型（text_value）：根据 useLlmBased 选择计算方式
  if (useLlmBased && llmSim !== null && llmSim !== undefined) {
    return llmSim;
  }

  // 基于测试集：同义词检查 + 包含关系 + 字符相似度
  if (areSynonyms(v1, v2)) return 100;

  // 检查包含关系：如果v1完全包含在v2中，或v2完全包含在v1中，则100%
  if (v2.includes(v1) || v1.includes(v2)) return 100;

  // 字符相似度：计算共同字符占测试集（较短文本）的比例
  const chars1 = v1.split('');
  const chars2 = new Set(v2.split(''));
  const common = chars1.filter(c => chars2.has(c)).length;
  return Math.round((common / v1.length) * 100);
}
