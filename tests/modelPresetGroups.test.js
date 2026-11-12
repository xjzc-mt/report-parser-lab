import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPresetProviderId,
  getPresetProviderLabel,
  groupPresetsByProvider
} from '../src/utils/modelPresetGroups.js';

const companyPreset = {
  id: 'company:conn_1:model-a',
  companyConnectionId: 'conn_1',
  companyConnectionName: 'MIO-妙盈',
  vendorKey: 'mio',
  credentialMode: 'company',
  modelName: 'model-a'
};

const personalOneApi = {
  id: 'preset_oneapi_a',
  vendorKey: 'oneapi',
  credentialMode: 'manual',
  modelName: 'model-a'
};

const personalOneApiB = {
  id: 'preset_oneapi_b',
  vendorKey: 'oneapi',
  credentialMode: 'manual',
  modelName: 'model-b'
};

test('公司连接按连接分组，个人预设按厂商分组', () => {
  const groups = groupPresetsByProvider([companyPreset, personalOneApi, personalOneApiB]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, 'company:conn_1');
  assert.equal(groups[0].label, 'MIO-妙盈');
  assert.equal(groups[0].presets.length, 1);
  assert.equal(groups[1].id, 'vendor:oneapi');
  assert.equal(groups[1].label, 'OneAPI');
  assert.equal(groups[1].presets.length, 2);
});

test('MIO 厂商显示为 MIO-妙盈', () => {
  const preset = { id: 'personal_mio', vendorKey: 'mio', modelName: 'model-a' };
  assert.equal(getPresetProviderId(preset), 'vendor:mio');
  assert.equal(getPresetProviderLabel(preset), 'MIO-妙盈');
});
