export const DEFAULT_VALIDATION_FIELD_MAPPINGS = Object.freeze([
  Object.freeze({ llmField: 'report_name', testField: 'report_name' }),
  Object.freeze({ llmField: 'indicator_code', testField: 'indicator_code' }),
  Object.freeze({ llmField: 'year', testField: 'data_year' })
]);

function cloneMappings(mappings) {
  return mappings.map((item) => ({
    llmField: item.llmField,
    testField: item.testField
  }));
}

export function normalizeValidationFieldMappings(mappings) {
  if (!Array.isArray(mappings)) return [];
  return mappings.map((item) => ({
    llmField: String(item?.llmField || '').trim(),
    testField: String(item?.testField || '').trim()
  }));
}

export function resolveValidationFieldMappings(mappings) {
  const normalized = normalizeValidationFieldMappings(mappings);
  return normalized.length > 0 ? normalized : cloneMappings(DEFAULT_VALIDATION_FIELD_MAPPINGS);
}

export function extractFieldOptionsFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0]) return [];
  return Object.keys(rows[0]);
}

export function validateValidationFieldMappings({ mappings, llmFields = [], testFields = [] }) {
  const normalized = normalizeValidationFieldMappings(mappings);
  const effectiveMappings = normalized.length > 0
    ? normalized
    : cloneMappings(DEFAULT_VALIDATION_FIELD_MAPPINGS);
  const llmSeen = new Set();
  const testSeen = new Set();

  for (let index = 0; index < effectiveMappings.length; index += 1) {
    const item = effectiveMappings[index];
    if (!item.llmField || !item.testField) {
      return {
        ok: false,
        error: `第 ${index + 1} 组关联字段未选择完整，请检查 LLM 字段和测试集字段。`
      };
    }
    if (!llmFields.includes(item.llmField)) {
      return {
        ok: false,
        error: `LLM 字段 "${item.llmField}" 不存在于当前文件中。`
      };
    }
    if (!testFields.includes(item.testField)) {
      return {
        ok: false,
        error: `测试集字段 "${item.testField}" 不存在于当前文件中。`
      };
    }
    if (llmSeen.has(item.llmField)) {
      return {
        ok: false,
        error: `LLM 字段 "${item.llmField}" 被重复使用，请调整关联配置。`
      };
    }
    if (testSeen.has(item.testField)) {
      return {
        ok: false,
        error: `测试集字段 "${item.testField}" 被重复使用，请调整关联配置。`
      };
    }

    llmSeen.add(item.llmField);
    testSeen.add(item.testField);
  }

  return {
    ok: true,
    mappings: effectiveMappings
  };
}

export function buildRowJoinKey(row, mappings, side) {
  return mappings
    .map((item) => {
      const key = side === 'llm' ? item.llmField : item.testField;
      return String(row?.[key] || '').trim();
    })
    .join('|||');
}
