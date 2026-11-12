import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ConfigValidationError, createConfigStore } from '../server/configStore.js';

const logger = { info() {}, warn() {}, error() {} };

async function createStore(t, env = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'llm-lab-config-'));
  const filePath = path.join(dir, 'config.json');
  const store = createConfigStore({
    filePath,
    env: {
      AUTO_SEED_COMPANY: 'false',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test-admin-password',
      ...env
    },
    logger
  });
  await store.load();
  await store.ensureAdminFromEnv();
  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  return { store, dir, filePath };
}

function createConnectionInput(overrides = {}) {
  return {
    name: '公司 OneAPI',
    transportType: 'openai_compatible',
    vendorKey: 'oneapi',
    baseUrl: 'https://one-api.example.com/v1',
    apiKey: 'fake-company-key',
    enabled: true,
    models: [
      {
        name: 'model-a',
        enabled: true,
        capabilities: {
          supportsPdfUpload: false,
          supportsJsonMode: true,
          supportsVision: false,
          supportsStreaming: true
        }
      }
    ],
    ...overrides
  };
}

test('配置初始化会写入管理员哈希并可在重启后读取', async (t) => {
  const { store, filePath } = await createStore(t);
  const config = store.get();

  assert.equal(config.admin.username, 'admin');
  assert.match(config.admin.passwordHash, /^scrypt\$/);
  assert.equal(config.admin.passwordHash.includes('test-admin-password'), false);

  const fileInfo = await stat(filePath);
  if (process.platform !== 'win32') {
    assert.equal(fileInfo.mode & 0o777, 0o600);
  }

  const reloaded = createConfigStore({
    filePath,
    env: { AUTO_SEED_COMPANY: 'false' },
    logger
  });
  await reloaded.load();
  await reloaded.ensureAdminFromEnv();
  assert.equal(reloaded.get().admin.username, 'admin');
  assert.equal(reloaded.get().admin.passwordHash, config.admin.passwordHash);
});

test('公司连接 CRUD 不向前端返回 Key 和 Base URL', async (t) => {
  const { store } = await createStore(t);
  const created = await store.createConnection(createConnectionInput());

  assert.equal(created.keyConfigured, true);
  assert.equal('apiKey' in created, false);
  assert.equal(created.baseUrl, 'https://one-api.example.com/v1');

  const publicConfig = store.toPublicConfig();
  assert.equal(publicConfig.companyConnections.length, 1);
  assert.equal(publicConfig.companyConnections[0].keyConfigured, true);
  assert.equal('apiKey' in publicConfig.companyConnections[0], false);
  assert.equal('baseUrl' in publicConfig.companyConnections[0], false);
  assert.equal('requestOptions' in publicConfig.companyConnections[0], false);
  assert.equal('requestOptions' in publicConfig.companyConnections[0].models[0], false);
  assert.equal(JSON.stringify(publicConfig).includes('fake-company-key'), false);

  const updated = await store.updateConnection(created.id, {
    name: '公司 OneAPI 更新',
    apiKey: ''
  });
  assert.equal(updated.name, '公司 OneAPI 更新');
  assert.equal(updated.keyConfigured, true);
  assert.equal(store.getConnectionWithSecret(created.id).apiKey, 'fake-company-key');

  const cleared = await store.updateConnection(created.id, { clearApiKey: true });
  assert.equal(cleared.keyConfigured, false);
  assert.equal(store.getConnectionWithSecret(created.id).apiKey, '');
});

test('非 Gemini 传输保留模型声明的 PDF 直传能力', async (t) => {
  const { store } = await createStore(t);
  const connection = await store.createConnection(createConnectionInput({
    models: [{
      name: 'model-a',
      capabilities: {
        supportsPdfUpload: true,
        supportsJsonMode: true
      }
    }]
  }));

  assert.equal(connection.models[0].capabilities.supportsPdfUpload, true);
});

test('公司连接配置会拒绝非法协议、模型和地址', async (t) => {
  const { store } = await createStore(t);

  await assert.rejects(
    () => store.createConnection(createConnectionInput({ transportType: 'unknown' })),
    ConfigValidationError
  );
  await assert.rejects(
    () => store.createConnection(createConnectionInput({ baseUrl: 'ftp://example.com' })),
    ConfigValidationError
  );
  await assert.rejects(
    () => store.createConnection(createConnectionInput({
      models: [{ name: 'model-a' }, { name: 'MODEL-A' }]
    })),
    ConfigValidationError
  );
  await assert.rejects(
    () => store.createConnection(createConnectionInput({
      requestOptions: JSON.parse('{"__proto__":{"polluted":true}}')
    })),
    ConfigValidationError
  );
});

test('页面配置会补齐默认值并收敛非法参数', async (t) => {
  const { store } = await createStore(t);
  const pages = await store.updatePages({
    'online-validation': {
      enabled: false,
      defaults: {
        batchSize: 999,
        maxConcurrency: 5,
        maxRetries: 99
      }
    },
    'prompt-optimization': {
      enabled: true,
      defaults: {
        maxOptIterations: 8,
        targetScoreThreshold: 120,
        unknown: 'ignored'
      }
    },
    'unknown-page': { enabled: false }
  });

  assert.equal(pages['online-validation'].enabled, false);
  assert.equal(pages['online-validation'].defaults.batchSize, 40);
  assert.equal(pages['online-validation'].defaults.maxConcurrency, 5);
  assert.equal(pages['online-validation'].defaults.maxRetries, 10);
  assert.equal(pages['prompt-optimization'].defaults.maxOptIterations, 8);
  assert.equal(pages['prompt-optimization'].defaults.targetScoreThreshold, 100);
  assert.equal('unknown-page' in pages, false);
  assert.equal(pages['prompt-iteration'].enabled, true);
});

test('服务端可用环境变量初始化公司连接且不重复创建', async (t) => {
  const { store, filePath } = await createStore(t, {
    AUTO_SEED_COMPANY: 'true',
    COMPANY_DEFAULT_API_KEY: 'fake-seeded-key',
    COMPANY_DEFAULT_NAME: '初始化连接',
    COMPANY_DEFAULT_VENDOR: 'gemini',
    COMPANY_DEFAULT_TRANSPORT: 'gemini_native',
    COMPANY_DEFAULT_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    COMPANY_DEFAULT_MODEL: 'gemini-2.5-pro'
  });

  await store.seedCompanyFromEnv();
  await store.seedCompanyFromEnv();

  const connections = store.listAdminConnections();
  assert.equal(connections.length, 1);
  assert.equal(connections[0].name, '初始化连接');
  assert.equal(connections[0].keyConfigured, true);
  assert.equal(connections[0].models[0].capabilities.supportsPdfUpload, true);
  assert.equal(JSON.stringify(store.toPublicConfig()).includes('fake-seeded-key'), false);

  const raw = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(raw.companyConnections[0].apiKey, 'fake-seeded-key');
  assert.equal(raw.envSeedApplied, true);

  await store.deleteConnection(connections[0].id);
  const reloaded = createConfigStore({
    filePath,
    env: {
      AUTO_SEED_COMPANY: 'true',
      COMPANY_DEFAULT_API_KEY: 'fake-seeded-key',
      COMPANY_DEFAULT_MODEL: 'gemini-2.5-pro'
    },
    logger
  });
  await reloaded.load();
  await reloaded.seedCompanyFromEnv();
  assert.equal(reloaded.get().companyConnections.length, 0);
});

test('服务端默认托管连接使用 OpenAI 兼容地址，并允许先不配置模型', async (t) => {
  const { store } = await createStore(t, {
    AUTO_SEED_COMPANY: 'true',
    COMPANY_DEFAULT_API_KEY: 'fake-seeded-key'
  });

  await store.seedCompanyFromEnv();
  const connections = store.listAdminConnections();
  assert.equal(connections.length, 1);
  assert.equal(connections[0].name, '团队模型');
  assert.equal(connections[0].vendorKey, 'openai');
  assert.equal(connections[0].transportType, 'openai_compatible');
  assert.equal(connections[0].baseUrl, 'https://api.openai.com/v1');
  assert.equal(connections[0].models.length, 0);
  assert.equal(JSON.stringify(store.toPublicConfig()).includes('fake-seeded-key'), false);
});


test('公司连接允许 OneAPI 返回超过 50 个模型', async (t) => {
  const { store } = await createStore(t);
  const models = Array.from({ length: 52 }, (_, index) => ({
    name: `oneapi-model-${index + 1}`,
    enabled: true,
    capabilities: {
      supportsPdfUpload: false,
      supportsJsonMode: true,
      supportsVision: false,
      supportsStreaming: true
    }
  }));
  const connection = await store.createConnection(createConnectionInput({ models }));
  assert.equal(connection.models.length, 52);
});
