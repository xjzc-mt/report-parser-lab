import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterPersistablePresets,
  initializeModelPresetSystem,
  mergePresetCollections,
  migrateLegacyPersonalPresets
} from '../src/services/modelPresetService.js';

function installLocalStorageMock() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
  return store;
}

function createManualPreset(id = 'preset_manual') {
  return {
    id,
    name: '个人模型',
    transportType: 'openai_compatible',
    vendorKey: 'custom',
    baseUrl: 'https://manual.example.com/v1',
    modelName: 'manual-model',
    credentialMode: 'manual',
    credentialRef: '',
    manualApiKey: 'manual-key',
    capabilities: { supportsPdfUpload: false, supportsJsonMode: true },
    status: 'active',
    isReadonly: false,
    isDefault: false
  };
}

test.beforeEach(() => {
  installLocalStorageMock();
});

test('mergePresetCollections 会按 id 去重并保留前者优先级', () => {
  const merged = mergePresetCollections(
    [{ id: 'preset_a', name: 'A' }, { id: 'preset_b', name: 'B' }],
    [{ id: 'preset_b', name: 'B2' }, { id: 'preset_c', name: 'C' }]
  );

  assert.deepEqual(merged, [
    { id: 'preset_a', name: 'A' },
    { id: 'preset_b', name: 'B' },
    { id: 'preset_c', name: 'C' }
  ]);
});

test('filterPersistablePresets 会剔除公司预设和旧 env 只读预设', () => {
  const presets = filterPersistablePresets([
    createManualPreset('manual'),
    { ...createManualPreset('company'), credentialMode: 'company' },
    { ...createManualPreset('env'), credentialMode: 'env' }
  ]);

  assert.deepEqual(presets.map((item) => item.id), ['manual']);
});

test('initializeModelPresetSystem 只保留个人预设，并清理旧 env 与公司缓存', () => {
  localStorage.setItem('llm_lab_model_presets', JSON.stringify([
    createManualPreset('manual'),
    { ...createManualPreset('env'), credentialMode: 'env', credentialRef: 'VITE_DEFAULT_GEMINI_API_KEY' },
    { ...createManualPreset('company'), credentialMode: 'company', companyConnectionId: 'conn_1' }
  ]));
  localStorage.setItem('llm_lab_global_model_selection', 'manual');

  const state = initializeModelPresetSystem();

  assert.deepEqual(state.presets.map((item) => item.id), ['manual']);
  assert.equal(state.globalDefaultPresetId, 'manual');
  assert.deepEqual(JSON.parse(localStorage.getItem('llm_lab_model_presets')).map((item) => item.id), ['manual']);
});

test('initializeModelPresetSystem 会保留尚未加载的公司全局默认选择', () => {
  localStorage.setItem('llm_lab_global_model_selection', 'company:conn_1:model-a');

  const state = initializeModelPresetSystem();

  assert.deepEqual(state.presets, []);
  assert.equal(state.globalDefaultPresetId, 'company:conn_1:model-a');
});

test('initializeModelPresetSystem 在旧全局默认已不存在时回退到个人预设', () => {
  localStorage.setItem('llm_lab_model_presets', JSON.stringify([createManualPreset('manual')]));
  localStorage.setItem('llm_lab_global_model_selection', 'preset_platform_default');

  const state = initializeModelPresetSystem();

  assert.equal(state.globalDefaultPresetId, 'manual');
});

test('initializeModelPresetSystem 会清理旧版 llm 设置 key', () => {
  localStorage.setItem('intelliextract_llm1', JSON.stringify({ apiKey: 'legacy-key' }));

  initializeModelPresetSystem();

  assert.equal(localStorage.getItem('intelliextract_llm1'), null);
});

test('migrateLegacyPersonalPresets 会把个人预设的 MIO-妙盈 供应商迁移为 OpenAI 兼容', () => {
  const legacy = {
    ...createManualPreset('legacy-mio'),
    vendorKey: 'mio',
    baseUrl: 'https://gateway.example.com/v1'
  };
  const migrated = migrateLegacyPersonalPresets([legacy, createManualPreset('manual')]);

  assert.equal(migrated[0].vendorKey, 'openai');
  assert.equal(migrated[0].baseUrl, 'https://gateway.example.com/v1');
  assert.equal(migrated[1].vendorKey, 'custom');
});

test('initializeModelPresetSystem 会持久化迁移后的个人预设', () => {
  localStorage.setItem('llm_lab_model_presets', JSON.stringify([
    { ...createManualPreset('legacy-mio'), vendorKey: 'mio' }
  ]));

  const state = initializeModelPresetSystem();

  assert.equal(state.presets[0].vendorKey, 'openai');
  assert.equal(JSON.parse(localStorage.getItem('llm_lab_model_presets'))[0].vendorKey, 'openai');
});
