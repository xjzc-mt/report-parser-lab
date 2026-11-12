import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRequirementsFromPromptAssets } from '../src/services/promptAssetRequirementService.js';

test('buildRequirementsFromPromptAssets 只保留有类型、编码和用户提示词的资产', () => {
  const requirements = buildRequirementsFromPromptAssets([
    {
      asset: { id: 'a1', indicatorCode: 'E1', indicatorName: '排放总量', valueType: '数值型' },
      latestVersion: { userPromptTemplate: '提取排放总量', systemPrompt: '系统提示词' }
    },
    {
      asset: { id: 'a2', indicatorCode: 'E2', indicatorName: '无类型', valueType: '' },
      latestVersion: { userPromptTemplate: '提取', systemPrompt: '' }
    },
    {
      asset: { id: 'a3', indicatorCode: 'E3', indicatorName: '无提示词', valueType: '文字型' },
      latestVersion: { userPromptTemplate: '', systemPrompt: '' }
    }
  ]);

  assert.equal(requirements.length, 1);
  assert.deepEqual(requirements[0], {
    value_type: '数值型',
    indicator_code: 'E1',
    indicator_name: '排放总量',
    definition: '',
    guidance: '',
    prompt: '提取排放总量',
    system_prompt: '系统提示词',
    output_contract: '',
    source_asset_id: 'a1'
  });
});
