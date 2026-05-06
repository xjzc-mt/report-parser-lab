import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPromptAssetLibraryEntries,
  buildPromptAssetExportSheets,
  buildPromptIterationSeed,
  deletePromptAssetVersion,
  findPromptAssetEntryByIndicatorCode,
  importPromptAssetRows,
  rollbackPromptAssetToVersion,
  savePromptAssetVersion,
  resolvePromptAssetBaseline
} from '../src/services/promptAssetLibraryService.js';

function createRepositoryHarness() {
  const assets = [];
  const versions = [];

  return {
    repository: {
      async listPromptAssets() {
        return assets.map((item) => ({ ...item }));
      },
      async listPromptVersions() {
        return versions.map((item) => ({ ...item }));
      },
      async savePromptAsset(asset) {
        const index = assets.findIndex((item) => item.id === asset.id);
        if (index >= 0) {
          assets[index] = { ...asset };
        } else {
          assets.push({ ...asset });
        }
        return asset;
      },
      async savePromptVersion(version) {
        const index = versions.findIndex((item) => item.id === version.id);
        if (index >= 0) {
          versions[index] = { ...version };
        } else {
          versions.push({ ...version });
        }
        return version;
      },
      async getPromptAsset(id) {
        const asset = assets.find((item) => item.id === id);
        return asset ? { ...asset } : null;
      },
      async getPromptVersion(id) {
        const version = versions.find((item) => item.id === id);
        return version ? { ...version } : null;
      },
      async deletePromptVersion(id) {
        const index = versions.findIndex((item) => item.id === id);
        if (index >= 0) {
          versions.splice(index, 1);
        }
      }
    },
    snapshot() {
      return {
        assets: assets.map((item) => ({ ...item })),
        versions: versions.map((item) => ({ ...item }))
      };
    }
  };
}

test('buildPromptAssetLibraryEntries 会按 asset 聚合最新版本和历史版本', () => {
  const entries = buildPromptAssetLibraryEntries(
    [
      {
        id: 'asset_1',
        name: '排放总量',
        indicatorCode: 'E1',
        indicatorName: '排放总量',
        latestVersionId: 'pver_2'
      }
    ],
    [
      { id: 'pver_1', assetId: 'asset_1', label: '初始版本', createdAt: 1000, userPromptTemplate: '旧 Prompt' },
      { id: 'pver_2', assetId: 'asset_1', label: '优化版本', createdAt: 2000, userPromptTemplate: '新 Prompt' }
    ]
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].latestVersion.id, 'pver_2');
  assert.equal(entries[0].versions.length, 2);
  assert.equal(entries[0].versions[0].id, 'pver_2');
});

test('findPromptAssetEntryByIndicatorCode 会返回对应指标的资产条目', () => {
  const entry = findPromptAssetEntryByIndicatorCode([
    {
      asset: { id: 'asset_1', indicatorCode: 'E1' },
      latestVersion: { id: 'pver_1' },
      versions: []
    }
  ], ' E1 ');

  assert.equal(entry?.asset?.id, 'asset_1');
});

test('resolvePromptAssetBaseline 优先使用资产库最新版本，缺失时回退对比文件 prompt', () => {
  const libraryBaseline = resolvePromptAssetBaseline({
    indicatorCode: 'E1',
    promptAssetEntries: [
      {
        asset: { id: 'asset_1', indicatorCode: 'E1', indicatorName: '排放总量' },
        latestVersion: {
          id: 'pver_1',
          systemPrompt: '系统提示词',
          userPromptTemplate: '资产库 Prompt'
        },
        versions: []
      }
    ],
    comparisonRows: [
      { indicator_code: 'E1', prompt: '对比文件 Prompt' }
    ]
  });

  const fallbackBaseline = resolvePromptAssetBaseline({
    indicatorCode: 'E2',
    promptAssetEntries: [],
    comparisonRows: [
      { indicator_code: 'E2', prompt: '对比文件 Prompt' }
    ]
  });

  assert.equal(libraryBaseline.source, 'library');
  assert.equal(libraryBaseline.userPromptTemplate, '资产库 Prompt');
  assert.equal(fallbackBaseline.source, 'comparison_file');
  assert.equal(fallbackBaseline.userPromptTemplate, '对比文件 Prompt');
});

test('buildPromptIterationSeed 会保留资产标识并写入待验证 Prompt', () => {
  const seed = buildPromptIterationSeed({
    assetId: 'asset_1',
    versionId: 'pver_2',
    indicatorCode: 'E1',
    indicatorName: '排放总量',
    systemPrompt: '系统提示词',
    userPrompt: '优化后的 Prompt'
  });

  assert.equal(seed.promptAssetId, 'asset_1');
  assert.equal(seed.promptVersionId, 'pver_2');
  assert.equal(seed.promptIndicatorCode, 'E1');
  assert.equal(seed.name, '排放总量');
  assert.equal(seed.userPrompt, '优化后的 Prompt');
});

test('importPromptAssetRows 会按 indicator_code 新建资产与导入版本', async () => {
  const harness = createRepositoryHarness();

  const summary = await importPromptAssetRows([
    {
      indicator_code: 'E1',
      indicator_name: '排放总量',
      system_prompt: '你是 ESG 提取助手',
      user_prompt: '提取排放总量'
    }
  ], {
    repository: harness.repository,
    now: () => 1000,
    createId: ((counts) => (prefix) => {
      counts[prefix] = (counts[prefix] || 0) + 1;
      return `${prefix}_${counts[prefix]}`;
    })({})
  });

  const snapshot = harness.snapshot();
  assert.equal(summary.createdCount, 1);
  assert.equal(summary.updatedCount, 0);
  assert.equal(summary.skippedCount, 0);
  assert.equal(snapshot.assets[0].indicatorCode, 'E1');
  assert.equal(snapshot.assets[0].latestVersionId, 'pver_1');
  assert.equal(snapshot.versions[0].sourceType, 'imported');
  assert.equal(snapshot.versions[0].userPromptTemplate, '提取排放总量');
});

test('importPromptAssetRows 在内容未变化时跳过新版本，变化时生成新版本并更新 latestVersionId', async () => {
  const harness = createRepositoryHarness();
  const createId = ((counts) => (prefix) => {
    counts[prefix] = (counts[prefix] || 0) + 1;
    return `${prefix}_${counts[prefix]}`;
  })({});

  await importPromptAssetRows([
    {
      indicator_code: 'E1',
      indicator_name: '排放总量',
      user_prompt: '提取排放总量'
    }
  ], {
    repository: harness.repository,
    now: () => 1000,
    createId
  });

  const skipped = await importPromptAssetRows([
    {
      indicator_code: 'E1',
      indicator_name: '排放总量',
      user_prompt: '提取排放总量'
    }
  ], {
    repository: harness.repository,
    now: () => 2000,
    createId
  });

  const updated = await importPromptAssetRows([
    {
      indicator_code: 'E1',
      indicator_name: '排放总量',
      user_prompt: '提取最新排放总量'
    }
  ], {
    repository: harness.repository,
    now: () => 3000,
    createId
  });

  const snapshot = harness.snapshot();
  assert.equal(skipped.skippedCount, 1);
  assert.equal(updated.updatedCount, 1);
  assert.equal(snapshot.assets[0].latestVersionId, 'pver_2');
  assert.equal(snapshot.versions.length, 2);
  assert.equal(snapshot.versions[1].userPromptTemplate, '提取最新排放总量');
});

test('importPromptAssetRows 在 Prompt 未变化但指标名称变化时更新资产元数据', async () => {
  const harness = createRepositoryHarness();
  const createId = ((counts) => (prefix) => {
    counts[prefix] = (counts[prefix] || 0) + 1;
    return `${prefix}_${counts[prefix]}`;
  })({});

  await importPromptAssetRows([
    {
      indicator_code: 'E1',
      indicator_name: '旧名称',
      user_prompt: '提取排放总量'
    }
  ], {
    repository: harness.repository,
    now: () => 1000,
    createId
  });

  const summary = await importPromptAssetRows([
    {
      indicator_code: 'E1',
      indicator_name: '新名称',
      user_prompt: '提取排放总量'
    }
  ], {
    repository: harness.repository,
    now: () => 2000,
    createId
  });

  const snapshot = harness.snapshot();
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.skippedCount, 0);
  assert.equal(snapshot.assets[0].indicatorName, '新名称');
  assert.equal(snapshot.versions.length, 1);
});

test('savePromptAssetVersion 会为现有资产追加新版本并切换为当前基线', async () => {
  const harness = createRepositoryHarness();
  const createId = ((counts) => (prefix) => {
    counts[prefix] = (counts[prefix] || 0) + 1;
    return `${prefix}_${counts[prefix]}`;
  })({});

  await importPromptAssetRows([
    {
      indicator_code: 'E1',
      indicator_name: '排放总量',
      user_prompt: '提取排放总量'
    }
  ], {
    repository: harness.repository,
    now: () => 1000,
    createId
  });

  const result = await savePromptAssetVersion({
    assetId: 'passet_1',
    indicatorCode: 'E1',
    indicatorName: '排放总量',
    systemPrompt: '系统提示词',
    userPromptTemplate: '提取排放总量并输出 JSON',
    label: '快速迭代写回',
    sourceType: 'iterated'
  }, {
    repository: harness.repository,
    now: () => 2000,
    createId
  });

  const snapshot = harness.snapshot();
  assert.equal(result.asset.latestVersionId, 'pver_2');
  assert.equal(result.version.id, 'pver_2');
  assert.equal(snapshot.assets[0].latestVersionId, 'pver_2');
  assert.equal(snapshot.versions.length, 2);
  assert.equal(snapshot.versions[1].sourceType, 'iterated');
});

test('savePromptAssetVersion 在 Prompt 内容无变化时不会新增版本', async () => {
  const harness = createRepositoryHarness();
  const createId = ((counts) => (prefix) => {
    counts[prefix] = (counts[prefix] || 0) + 1;
    return `${prefix}_${counts[prefix]}`;
  })({});

  await importPromptAssetRows([
    {
      indicator_code: 'E1',
      indicator_name: '排放总量',
      system_prompt: '系统提示词',
      user_prompt: '提取排放总量'
    }
  ], {
    repository: harness.repository,
    now: () => 1000,
    createId
  });

  const result = await savePromptAssetVersion({
    assetId: 'passet_1',
    indicatorCode: 'E1',
    indicatorName: '排放总量',
    systemPrompt: '系统提示词',
    userPromptTemplate: '提取排放总量',
    label: '快速迭代写回',
    sourceType: 'iterated'
  }, {
    repository: harness.repository,
    now: () => 2000,
    createId
  });

  const snapshot = harness.snapshot();
  assert.equal(result.createdVersion, false);
  assert.equal(result.version.id, 'pver_1');
  assert.equal(snapshot.assets[0].latestVersionId, 'pver_1');
  assert.equal(snapshot.versions.length, 1);
});

test('rollbackPromptAssetToVersion 会把历史版本重新设为当前基线', async () => {
  const harness = createRepositoryHarness();
  const createId = ((counts) => (prefix) => {
    counts[prefix] = (counts[prefix] || 0) + 1;
    return `${prefix}_${counts[prefix]}`;
  })({});

  await importPromptAssetRows([
    { indicator_code: 'E1', indicator_name: '排放总量', user_prompt: '旧 Prompt' }
  ], {
    repository: harness.repository,
    now: () => 1000,
    createId
  });
  await importPromptAssetRows([
    { indicator_code: 'E1', indicator_name: '排放总量', user_prompt: '新 Prompt' }
  ], {
    repository: harness.repository,
    now: () => 2000,
    createId
  });

  const result = await rollbackPromptAssetToVersion({
    assetId: 'passet_1',
    versionId: 'pver_1'
  }, {
    repository: harness.repository,
    now: () => 3000
  });

  assert.equal(result.asset.latestVersionId, 'pver_1');
  assert.equal(harness.snapshot().assets[0].latestVersionId, 'pver_1');
});

test('deletePromptAssetVersion 不允许删除当前基线，但允许删除历史版本', async () => {
  const harness = createRepositoryHarness();
  const createId = ((counts) => (prefix) => {
    counts[prefix] = (counts[prefix] || 0) + 1;
    return `${prefix}_${counts[prefix]}`;
  })({});

  await importPromptAssetRows([
    { indicator_code: 'E1', indicator_name: '排放总量', user_prompt: '旧 Prompt' }
  ], {
    repository: harness.repository,
    now: () => 1000,
    createId
  });
  await importPromptAssetRows([
    { indicator_code: 'E1', indicator_name: '排放总量', user_prompt: '新 Prompt' }
  ], {
    repository: harness.repository,
    now: () => 2000,
    createId
  });

  await assert.rejects(
    () => deletePromptAssetVersion({
      assetId: 'passet_1',
      versionId: 'pver_2'
    }, {
      repository: harness.repository
    }),
    /当前基线/
  );

  const result = await deletePromptAssetVersion({
    assetId: 'passet_1',
    versionId: 'pver_1'
  }, {
    repository: harness.repository
  });

  assert.equal(result.deletedVersionId, 'pver_1');
  assert.deepEqual(harness.snapshot().versions.map((item) => item.id), ['pver_2']);
});

test('buildPromptAssetExportSheets 会生成资产总表和版本明细表', () => {
  const sheets = buildPromptAssetExportSheets([
    {
      asset: {
        id: 'asset_1',
        name: '排放总量',
        indicatorCode: 'E1',
        indicatorName: '排放总量',
        latestVersionId: 'pver_2',
        updatedAt: 2000
      },
      latestVersion: {
        id: 'pver_2',
        label: '优化版本',
        systemPrompt: '系统提示词',
        userPromptTemplate: '新 Prompt',
        sourceType: 'optimized',
        createdAt: 2000
      },
      versions: [
        {
          id: 'pver_2',
          assetId: 'asset_1',
          label: '优化版本',
          systemPrompt: '系统提示词',
          userPromptTemplate: '新 Prompt',
          sourceType: 'optimized',
          createdAt: 2000
        },
        {
          id: 'pver_1',
          assetId: 'asset_1',
          label: '初始版本',
          systemPrompt: '',
          userPromptTemplate: '旧 Prompt',
          sourceType: 'imported',
          createdAt: 1000
        }
      ]
    }
  ]);

  assert.equal(sheets.assets.length, 1);
  assert.equal(sheets.versions.length, 2);
  assert.equal(sheets.assets[0].latest_version_label, '优化版本');
  assert.equal(sheets.versions[0].is_current, '是');
  assert.equal(sheets.versions[1].is_current, '否');
});
