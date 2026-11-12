import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPresetSelectOptions, formatPresetSummary } from '../src/utils/modelPresetPresentation.js';

test('buildPresetSelectOptions 会为能力不满足的预设打上 disabled 和原因说明', () => {
  const options = buildPresetSelectOptions(
    [
      {
        id: 'preset_a',
        name: 'Gemini 稳定版',
        vendorKey: 'gemini',
        modelName: 'gemini-2.5-pro',
        capabilities: { supportsPdfUpload: true, supportsJsonMode: true }
      },
      {
        id: 'preset_b',
        name: 'OpenAI 低成本',
        vendorKey: 'openai',
        modelName: 'gpt-4.1-mini',
        capabilities: { supportsPdfUpload: false, supportsJsonMode: true }
      }
    ],
    { supportsPdfUpload: true }
  );

  assert.equal(options[0].disabled, false);
  assert.equal(options[1].disabled, true);
  assert.match(options[1].description, /PDF 直传/);
});

test('formatPresetSummary 会提示高级请求参数已配置', () => {
  const summary = formatPresetSummary({
    name: 'DeepSeek 推理',
    vendorKey: 'deepseek',
    modelName: 'deepseek-v4-pro',
    requestOptions: {
      thinking: { type: 'enabled' }
    }
  }, {
    apiKey: 'key'
  });

  assert.equal(summary.title, 'DeepSeek 推理');
  assert.match(summary.meta, /高级参数/);
});


test('formatPresetSummary 会提示原模型预设已失效', () => {
  const summary = formatPresetSummary(null, { staleSelection: true });
  assert.match(summary.title, /已失效/);
  assert.match(summary.meta, /不会自动切换/);
});
