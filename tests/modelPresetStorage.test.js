import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupLegacyLlmSettings,
  clearPageModelSelection,
  loadGlobalDefaultModelSelection,
  loadAllPageModelSelections,
  loadModelPresets,
  loadPageModelSelection,
  saveGlobalDefaultModelSelection,
  saveModelPresets,
  savePageModelSelection
} from '../src/utils/modelPresetStorage.js';

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

test.beforeEach(() => {
  installLocalStorageMock();
});

test('saveModelPresets/loadModelPresets 可完整往返', () => {
  const presets = [{ id: 'preset_gemini_default', name: '默认 Gemini' }];
  saveModelPresets(presets);

  assert.deepEqual(loadModelPresets(), presets);
});

test('saveModelPresets 不会把公司托管预设写入 localStorage', () => {
  saveModelPresets([
    { id: 'preset_manual', credentialMode: 'manual', name: '个人预设' },
    { id: 'company:conn_1:model-a', credentialMode: 'company', name: '公司预设' }
  ]);

  assert.deepEqual(loadModelPresets().map((item) => item.id), ['preset_manual']);
});

test('savePageModelSelection/loadPageModelSelection 可按页面独立恢复', () => {
  savePageModelSelection('prompt-iteration', 'preset_gemini_default');
  savePageModelSelection('online-validation', 'preset_claude_default');

  assert.equal(loadPageModelSelection('prompt-iteration'), 'preset_gemini_default');
  assert.equal(loadPageModelSelection('online-validation'), 'preset_claude_default');
  assert.deepEqual(loadAllPageModelSelections(), {
    'prompt-iteration': 'preset_gemini_default',
    'online-validation': 'preset_claude_default'
  });
});

test('saveGlobalDefaultModelSelection/loadGlobalDefaultModelSelection 可往返全局默认模型选择', () => {
  saveGlobalDefaultModelSelection('preset_openai_default');

  assert.equal(loadGlobalDefaultModelSelection(), 'preset_openai_default');
});

test('clearPageModelSelection 会删除页面级模型覆盖并保留其他页面', () => {
  savePageModelSelection('prompt-iteration', 'preset_gemini_default');
  savePageModelSelection('online-validation', 'preset_claude_default');

  clearPageModelSelection('prompt-iteration');

  assert.equal(loadPageModelSelection('prompt-iteration'), '');
  assert.deepEqual(loadAllPageModelSelections(), {
    'online-validation': 'preset_claude_default'
  });
});

test('cleanupLegacyLlmSettings 会删除旧 llm1/llm2 localStorage key', () => {
  localStorage.setItem('intelliextract_llm1', JSON.stringify({
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'legacy-key-1',
    modelName: 'gemini-2.5-pro',
    providerType: 'gemini'
  }));
  localStorage.setItem('intelliextract_llm2', JSON.stringify({
    apiUrl: 'https://api.openai.example.com/v1',
    apiKey: 'legacy-key-2',
    modelName: 'gpt-4.1',
    providerType: 'openai',
    similarityThreshold: 70
  }));

  cleanupLegacyLlmSettings();

  assert.equal(localStorage.getItem('intelliextract_llm1'), null);
  assert.equal(localStorage.getItem('intelliextract_llm2'), null);
});
