import { NOT_FOUND_VALUE, PROCESSABLE_VALUE_TYPES } from '../constants/extraction.js';

export function isValidValue(value) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return !['n/a', 'na', '-', '无', '未提及', '未找到', NOT_FOUND_VALUE].includes(normalized);
}

export function normalizeValueType(type) {
  const vt = String(type || '').trim().toUpperCase();

  // 英文及变体转换
  if (vt === 'TEXT' || vt === 'STRING' || vt === '文字型' || vt === '文本型' || vt === '') {
    return '文字型';
  }
  if (vt === 'NUMERIC' || vt === 'NUMBER' || vt === '数值型') {
    return '数值型';
  }
  if (vt === 'CURRENCY' || vt === 'MONEY' || vt === '货币型') {
    return '货币型';
  }
  if (vt === 'INTENSITY' || vt === 'RATIO' || vt === '强度型') {
    return '强度型';
  }

  // 检查是否已经是标准中文
  if (PROCESSABLE_VALUE_TYPES.includes(vt)) {
    return vt;
  }

  return '文字型';
}

export function getRequirementValueType(requirement) {
  return normalizeValueType(requirement.value_type || requirement.indicator_type || '');
}

export function isTextType(type) {
  return normalizeValueType(type) === '文字型';
}

export function isIntensityType(type) {
  return normalizeValueType(type) === '强度型';
}

export function isCurrencyType(type) {
  return normalizeValueType(type) === '货币型';
}

export function isNumericType(type) {
  const valueType = normalizeValueType(type);
  return valueType === '数值型' || valueType === '强度型' || valueType === '货币型';
}

export function isResultFound(item) {
  return isTextType(item.value_type || item.indicator_type)
    ? isValidValue(item.text_value)
    : isValidValue(item.num_value);
}

export function normalizeRequirementRow(row) {
  return {
    value_type: getRequirementValueType(row),
    indicator_code: String(row.indicator_code || '').trim(),
    indicator_name: String(row.indicator_name || '').trim(),
    definition: String(row.definition || '').trim(),
    guidance: String(row.guidance || '').trim(),
    prompt: String(row.prompt || '').trim(),
    system_prompt: String(row.system_prompt || row.systemPrompt || '').trim(),
    output_contract: String(row.output_contract || row.outputContract || '').trim(),
    source_asset_id: String(row.source_asset_id || '').trim()
  };
}

export function getSelectedIndicatorTypes(indicatorTypes) {
  return [...new Set((indicatorTypes || []).map(normalizeValueType))]
    .filter((type) => PROCESSABLE_VALUE_TYPES.includes(type));
}

export function getDefaultResultByType(valueType) {
  return {
    text_value: isTextType(valueType) ? NOT_FOUND_VALUE : '',
    num_value: isNumericType(valueType) ? NOT_FOUND_VALUE : '',
    unit: isNumericType(valueType) ? NOT_FOUND_VALUE : '',
    currency: isCurrencyType(valueType) ? NOT_FOUND_VALUE : '',
    numerator_unit: isIntensityType(valueType) ? NOT_FOUND_VALUE : '',
    denominator_unit: isIntensityType(valueType) ? NOT_FOUND_VALUE : '',
    pdf_numbers: NOT_FOUND_VALUE
  };
}

export function getResultsArray(parsedData) {
  if (Array.isArray(parsedData)) {
    return parsedData;
  }
  if (parsedData?.results && Array.isArray(parsedData.results)) {
    return parsedData.results;
  }
  if (parsedData?.result && Array.isArray(parsedData.result)) {
    return parsedData.result;
  }
  return Object.values(parsedData || {}).find((value) => Array.isArray(value)) || [];
}

export function buildMissingResult(requirement) {
  const valueType = getRequirementValueType(requirement);
  return {
    indicator_code: requirement.indicator_code,
    indicator_name: requirement.indicator_name || '',
    value_type: valueType,
    indicator_type: valueType,
    year: '',
    ...getDefaultResultByType(valueType)
  };
}

function findKey(object, search) {
  const key = Object.keys(object || {}).find((candidate) => candidate.toLowerCase() === search.toLowerCase());
  return key ? object[key] : null;
}

export function mapBatchResults(batch, resultsArray) {
  const mappedResults = [];

  batch.forEach((requirement) => {
    const requirementCode = String(requirement.indicator_code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    const matchingResults = resultsArray.filter((result) => {
      const rawCode = result.indicator_code || result.indicatorCode || result.code || result.id || result.ID || result.Code || '';
      const normalizedCode = String(rawCode).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedCode !== '' && (
        normalizedCode === requirementCode ||
        requirementCode.endsWith(normalizedCode) ||
        normalizedCode.endsWith(requirementCode)
      );
    });

    const valueType = getRequirementValueType(requirement);

    if (matchingResults.length === 0) {
      mappedResults.push(buildMissingResult(requirement));
      return;
    }

    matchingResults.forEach((found) => {
      const defaults = getDefaultResultByType(valueType);
      const textValue = findKey(found, 'text_value') || findKey(found, 'textValue') || findKey(found, 'text') || findKey(found, 'value') || NOT_FOUND_VALUE;
      const numValue = findKey(found, 'num_value') || findKey(found, 'numValue') || findKey(found, 'value') || findKey(found, 'number') || NOT_FOUND_VALUE;
      const year = findKey(found, 'year') || findKey(found, 'Year') || '';
      const unit = findKey(found, 'unit') || findKey(found, 'Unit') || NOT_FOUND_VALUE;
      const currency = findKey(found, 'currency') || findKey(found, 'Currency') || findKey(found, 'currency_code') || findKey(found, 'currencyCode') || NOT_FOUND_VALUE;
      const numeratorUnit = findKey(found, 'numerator_unit') || findKey(found, 'numeratorUnit') || NOT_FOUND_VALUE;
      const denominatorUnit = findKey(found, 'denominator_unit') || findKey(found, 'denominatorUnit') || NOT_FOUND_VALUE;
      const pdfNumbers = findKey(found, 'pdf_numbers') || findKey(found, 'pdfNumbers') || findKey(found, 'page_numbers') || findKey(found, 'pageNumbers') || findKey(found, 'page_number') || findKey(found, 'pageNumber') || findKey(found, 'page') || NOT_FOUND_VALUE;

      mappedResults.push({
        indicator_code: requirement.indicator_code,
        indicator_name: requirement.indicator_name || '',
        value_type: valueType,
        indicator_type: valueType,
        year,
        text_value: isTextType(valueType) ? textValue : defaults.text_value,
        num_value: isNumericType(valueType) ? numValue : defaults.num_value,
        unit: isNumericType(valueType) ? unit : defaults.unit,
        currency: isCurrencyType(valueType) ? currency : defaults.currency,
        numerator_unit: isIntensityType(valueType) ? numeratorUnit : defaults.numerator_unit,
        denominator_unit: isIntensityType(valueType) ? denominatorUnit : defaults.denominator_unit,
        pdf_numbers: pdfNumbers
      });
    });
  });

  return mappedResults;
}

export function buildExportData(results) {
  return results
    .filter(isResultFound)
    .map((item) => ({
      source_file: item.source_file || '',
      indicator_code: item.indicator_code || '',
      indicator_name: item.indicator_name || '',
      value_type: item.value_type || getRequirementValueType(item),
      year: item.year || '',
      text_value: item.text_value || '',
      num_value: item.num_value || '',
      unit: item.unit || '',
      currency: item.currency || '',
      numerator_unit: item.numerator_unit || '',
      denominator_unit: item.denominator_unit || '',
      pdf_numbers: item.pdf_numbers || ''
    }));
}

export function splitRequirementsIntoBatches(requirements, batchSize) {
  const textRequirements = requirements.filter((item) => isTextType(item.value_type));
  const numericRequirements = requirements.filter((item) => normalizeValueType(item.value_type) === '数值型');
  const intensityRequirements = requirements.filter((item) => isIntensityType(item.value_type));
  const currencyRequirements = requirements.filter((item) => isCurrencyType(item.value_type));

  const allBatches = [];
  const pushBatches = (items, batchType) => {
    for (let index = 0; index < items.length; index += batchSize) {
      allBatches.push({ batch: items.slice(index, index + batchSize), batchType });
    }
  };

  pushBatches(textRequirements, '文字型');
  pushBatches(numericRequirements, '数值型');
  pushBatches(intensityRequirements, '强度型');
  pushBatches(currencyRequirements, '货币型');

  return {
    allBatches,
    counts: {
      textCount: textRequirements.length,
      numericCount: numericRequirements.length,
      intensityCount: intensityRequirements.length,
      currencyCount: currencyRequirements.length
    }
  };
}
