import { PROCESSABLE_VALUE_TYPES } from '../constants/extraction.js';

export function buildRequirementsFromPromptAssets(entries = []) {
  const typeSet = new Set(PROCESSABLE_VALUE_TYPES);

  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const asset = entry?.asset || {};
      const version = entry?.latestVersion || null;
      return {
        value_type: String(asset.valueType || '').trim(),
        indicator_code: String(asset.indicatorCode || '').trim(),
        indicator_name: String(asset.indicatorName || asset.name || '').trim(),
        definition: '',
        guidance: '',
        prompt: String(version?.userPromptTemplate || '').trim(),
        system_prompt: String(version?.systemPrompt || '').trim(),
        output_contract: String(version?.outputContract || '').trim(),
        source_asset_id: String(asset.id || '').trim()
      };
    })
    .filter((row) => (
      row.indicator_code
      && row.prompt
      && typeSet.has(row.value_type)
    ));
}
