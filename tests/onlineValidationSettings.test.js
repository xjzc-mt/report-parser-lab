import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOnlineValidationRunSettings } from '../src/utils/onlineValidationSettings.js';

test('线上验证保留个人预设高级参数', () => {
  const settings = buildOnlineValidationRunSettings({
    baseSettings: { batchSize: 40, requestOptions: { stale: true } },
    selectedIndicatorTypes: ['数值型'],
    runtimeConfig: {
      apiUrl: 'https://one-api.example.com/v1',
      apiKey: 'personal-key',
      modelName: 'qwen3.8-flash',
      providerType: 'openai',
      requestOptions: { temperature: 0.2, max_tokens: 2048 }
    }
  });

  assert.deepEqual(settings.requestOptions, { temperature: 0.2, max_tokens: 2048 });
  assert.equal(settings.batchSize, 40);
  assert.equal(settings.apiKey, 'personal-key');
  assert.equal(settings.maxRetries, undefined);
});
