import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

import { normalizePageConfig } from '../src/constants/platformPages.js';
import { isPasswordHash, hashPassword, verifyPassword } from './password.js';

export class ConfigValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export const CONFIG_VERSION = 1;
export const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'server/data/config.json');
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

const TRANSPORT_TYPES = new Set(['gemini_native', 'anthropic_native', 'openai_compatible']);
const VENDOR_KEYS = new Set(['gemini', 'claude', 'openai', 'oneapi', 'mio', 'deepseek', 'glm', 'custom']);
const DEFAULT_CAPABILITIES = {
  supportsPdfUpload: false,
  supportsJsonMode: true,
  supportsVision: false,
  supportsStreaming: false
};
const FORBIDDEN_OPTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_CONNECTIONS = 20;
const MAX_MODELS_PER_CONNECTION = 200;
const MAX_REQUEST_OPTIONS_BYTES = 20000;

function nowIso(now) {
  return new Date(now()).toISOString();
}

function asString(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function createConnectionId() {
  return `conn_${randomBytes(9).toString('hex')}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRequestOptions(raw, depth = 0) {
  if (!isPlainObject(raw)) {
    return {};
  }
  if (depth > 5) {
    throw new ConfigValidationError('高级请求参数嵌套过深。');
  }

  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_OPTION_KEYS.has(key)) {
      throw new ConfigValidationError(`高级请求参数包含不允许的字段：${key}`);
    }
    if (isPlainObject(value)) {
      result[key] = normalizeRequestOptions(value, depth + 1);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => (isPlainObject(item) ? normalizeRequestOptions(item, depth + 1) : item));
    } else if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      result[key] = value;
    }
  }

  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_REQUEST_OPTIONS_BYTES) {
    throw new ConfigValidationError('高级请求参数过大。');
  }
  return result;
}

function normalizeCapabilities(raw = {}) {
  return {
    supportsPdfUpload: Boolean(raw.supportsPdfUpload),
    supportsJsonMode: raw.supportsJsonMode === undefined ? true : Boolean(raw.supportsJsonMode),
    supportsVision: Boolean(raw.supportsVision),
    supportsStreaming: Boolean(raw.supportsStreaming)
  };
}

function normalizeBaseUrl(raw) {
  const value = asString(raw, 2000);
  if (!value) {
    throw new ConfigValidationError('公司连接地址不能为空。');
  }

  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new ConfigValidationError('公司连接地址必须是合法的 http/https URL。');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ConfigValidationError('公司连接地址只支持 http 或 https。');
  }
  if (url.username || url.password) {
    throw new ConfigValidationError('公司连接地址不能包含用户名或密码。');
  }

  return value.replace(/\/+$/, '');
}

function normalizeModel(raw, index) {
  if (!isPlainObject(raw)) {
    throw new ConfigValidationError(`第 ${index + 1} 个模型配置无效。`);
  }

  const name = asString(raw.name, 200);
  if (!name) {
    throw new ConfigValidationError(`第 ${index + 1} 个模型缺少模型名称。`);
  }

  const maxTokens = Number(raw.maxTokens);
  return {
    name,
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    capabilities: normalizeCapabilities(raw.capabilities),
    requestOptions: normalizeRequestOptions(raw.requestOptions),
    maxTokens: Number.isFinite(maxTokens)
      ? Math.min(32768, Math.max(1, Math.round(maxTokens)))
      : 8192
  };
}

function normalizeModels(rawModels) {
  if (!Array.isArray(rawModels)) {
    return [];
  }
  if (rawModels.length > MAX_MODELS_PER_CONNECTION) {
    throw new ConfigValidationError(`每个公司连接最多配置 ${MAX_MODELS_PER_CONNECTION} 个模型。`);
  }

  const seen = new Set();
  return rawModels.map((raw, index) => {
    const model = normalizeModel(raw, index);
    const dedupeKey = model.name.toLowerCase();
    if (seen.has(dedupeKey)) {
      throw new ConfigValidationError(`模型名称重复：${model.name}`);
    }
    seen.add(dedupeKey);
    return model;
  });
}

function normalizeConnection(raw, options = {}) {
  if (!isPlainObject(raw)) {
    throw new ConfigValidationError('公司连接配置无效。');
  }

  const now = options.now ?? (() => Date.now());
  const existing = options.existing ?? null;
  const transportType = asString(raw.transportType, 40) || 'openai_compatible';
  if (!TRANSPORT_TYPES.has(transportType)) {
    throw new ConfigValidationError(`不支持的公司连接协议：${transportType}`);
  }

  const vendorKey = asString(raw.vendorKey, 40) || 'custom';
  if (!VENDOR_KEYS.has(vendorKey)) {
    throw new ConfigValidationError(`不支持的公司模型厂商：${vendorKey}`);
  }

  const name = asString(raw.name, 80);
  if (!name) {
    throw new ConfigValidationError('公司连接名称不能为空。');
  }

  let apiKey = String(existing?.apiKey || '');
  if (raw.clearApiKey === true) {
    apiKey = '';
  } else if (String(raw.apiKey ?? '').trim()) {
    apiKey = String(raw.apiKey).trim();
  }

  const preserveTimestamps = options.preserveTimestamps === true;

  return {
    id: asString(raw.id || existing?.id, 80) || createConnectionId(),
    name,
    transportType,
    vendorKey,
    baseUrl: normalizeBaseUrl(raw.baseUrl ?? existing?.baseUrl),
    apiKey,
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    models: normalizeModels(raw.models ?? existing?.models ?? []),
    requestOptions: normalizeRequestOptions(raw.requestOptions ?? existing?.requestOptions ?? {}),
    createdAt: existing?.createdAt || asString(raw.createdAt, 40) || nowIso(now),
    updatedAt: preserveTimestamps
      ? (asString(raw.updatedAt, 40) || nowIso(now))
      : nowIso(now)
  };
}

function normalizeAdmin(raw) {
  if (!raw) {
    return null;
  }
  if (!isPlainObject(raw) || !isPasswordHash(raw.passwordHash)) {
    throw new ConfigValidationError('管理员配置无效：缺少合法的密码哈希。');
  }
  return {
    username: asString(raw.username, 80) || 'admin',
    passwordHash: String(raw.passwordHash)
  };
}

export function normalizeConfig(raw, options = {}) {
  const source = isPlainObject(raw) ? raw : {};
  const version = Number(source.version || CONFIG_VERSION);
  if (version > CONFIG_VERSION) {
    throw new ConfigValidationError(`配置文件版本 ${version} 高于当前服务支持的版本 ${CONFIG_VERSION}。`);
  }

  const rawConnections = Array.isArray(source.companyConnections) ? source.companyConnections : [];
  if (rawConnections.length > MAX_CONNECTIONS) {
    throw new ConfigValidationError(`公司连接数量超过上限 ${MAX_CONNECTIONS}。`);
  }

  const connections = rawConnections.map((item) => normalizeConnection(item, {
    ...options,
    preserveTimestamps: true
  }));
  const ids = new Set();
  for (const connection of connections) {
    if (ids.has(connection.id)) {
      throw new ConfigValidationError(`公司连接 ID 重复：${connection.id}`);
    }
    ids.add(connection.id);
  }

  return {
    version: CONFIG_VERSION,
    admin: normalizeAdmin(source.admin),
    companyConnections: connections,
    pages: normalizePageConfig(source.pages),
    envSeedApplied: Boolean(source.envSeedApplied),
    updatedAt: asString(source.updatedAt, 40) || nowIso(options.now ?? (() => Date.now()))
  };
}

async function readConfigFile(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`配置文件不是合法 JSON：${filePath}`);
    }
    throw error;
  }
}

async function writeConfigFile(filePath, config) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(tempPath, 'w', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, filePath);
  try {
    await chmod(filePath, 0o600);
  } catch (_) {
    // Windows 等平台可能不支持 chmod，权限由部署环境保证。
  }
  try {
    const dirHandle = await open(dir, 'r');
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch (_) {
    // 目录 fsync 不是所有平台都支持。
  }
}

function toPublicConnection(connection) {
  return {
    id: connection.id,
    name: connection.name,
    transportType: connection.transportType,
    vendorKey: connection.vendorKey,
    enabled: Boolean(connection.enabled),
    keyConfigured: Boolean(connection.apiKey),
    models: connection.models.map((model) => ({
      name: model.name,
      enabled: Boolean(model.enabled),
      capabilities: { ...model.capabilities },
      maxTokens: model.maxTokens
    }))
  };
}

function toAdminConnection(connection) {
  return {
    id: connection.id,
    name: connection.name,
    transportType: connection.transportType,
    vendorKey: connection.vendorKey,
    baseUrl: connection.baseUrl,
    enabled: Boolean(connection.enabled),
    keyConfigured: Boolean(connection.apiKey),
    models: connection.models.map((model) => ({
      name: model.name,
      enabled: Boolean(model.enabled),
      capabilities: { ...model.capabilities },
      requestOptions: structuredClone(model.requestOptions || {}),
      maxTokens: model.maxTokens
    })),
    requestOptions: structuredClone(connection.requestOptions || {}),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  };
}

function defaultTransportForVendor(vendorKey) {
  if (vendorKey === 'gemini') return 'gemini_native';
  if (vendorKey === 'claude') return 'anthropic_native';
  return 'openai_compatible';
}

function defaultBaseUrlForTransport(transportType) {
  if (transportType === 'gemini_native') {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
  if (transportType === 'anthropic_native') {
    return 'https://api.anthropic.com';
  }
  return '';
}

function defaultBaseUrlForVendor(vendorKey, transportType) {
  if (vendorKey === 'openai') {
    return DEFAULT_OPENAI_BASE_URL;
  }
  return defaultBaseUrlForTransport(transportType);
}

function inferVendorFromEnv(env) {
  const explicit = asString(env.COMPANY_DEFAULT_VENDOR || env.VITE_PLATFORM_DEFAULT_VENDOR, 40).toLowerCase();
  if (VENDOR_KEYS.has(explicit)) {
    return explicit;
  }
  const transport = asString(env.VITE_PLATFORM_DEFAULT_TRANSPORT, 40);
  if (transport === 'gemini_native') return 'gemini';
  if (transport === 'anthropic_native') return 'claude';
  const baseUrl = asString(env.VITE_PLATFORM_DEFAULT_BASE_URL, 2000).toLowerCase();
  if (baseUrl.includes('googleapis.com')) return 'gemini';
  if (baseUrl.includes('anthropic.com')) return 'claude';
  if (baseUrl.includes('deepseek.com')) return 'deepseek';
  if (baseUrl.includes('bigmodel.cn')) return 'glm';
  if (baseUrl.includes('one-api') || baseUrl.includes('miotech')) return 'mio';
  return 'openai';
}

export function createConfigStore({
  filePath = DEFAULT_CONFIG_PATH,
  env = process.env,
  logger = console,
  now = () => Date.now()
} = {}) {
  let config = null;
  let writeQueue = Promise.resolve();

  const store = {
    get filePath() {
      return filePath;
    },

    get() {
      if (!config) {
        throw new Error('配置尚未加载。');
      }
      return structuredClone(config);
    },

    async load() {
      const raw = await readConfigFile(filePath);
      config = normalizeConfig(raw, { now });
      if (!raw) {
        await writeConfigFile(filePath, config);
      }
      return store.get();
    },

    async ensureAdminFromEnv() {
      const username = asString(env.ADMIN_USERNAME, 80) || 'admin';
      const envHash = asString(env.ADMIN_PASSWORD_HASH, 1000);
      const envPassword = String(env.ADMIN_PASSWORD || '');

      let passwordHash = '';
      if (envHash) {
        if (!isPasswordHash(envHash)) {
          throw new Error('ADMIN_PASSWORD_HASH 格式无效，应为 scrypt$N$r$p$salt$hash。');
        }
        passwordHash = envHash;
      } else if (envPassword) {
        const existingMatches = config.admin?.username === username
          && config.admin?.passwordHash
          && verifyPassword(envPassword, config.admin.passwordHash);
        if (existingMatches) {
          return;
        }
        passwordHash = hashPassword(envPassword);
      }

      if (passwordHash) {
        const changed = config.admin?.username !== username || config.admin?.passwordHash !== passwordHash;
        if (changed) {
          await store.update((next) => {
            next.admin = { username, passwordHash };
          });
        }
        return;
      }

      if (!config.admin?.passwordHash) {
        throw new Error('未配置管理员凭据。请设置 ADMIN_PASSWORD_HASH 或 ADMIN_PASSWORD 后重启服务。');
      }
    },

    async seedCompanyFromEnv() {
      if (String(env.AUTO_SEED_COMPANY || '').toLowerCase() === 'false') {
        return;
      }
      if (config.envSeedApplied) {
        return;
      }
      if (config.companyConnections.length > 0) {
        await store.update((next) => {
          next.envSeedApplied = true;
        });
        return;
      }

      const vendorKey = inferVendorFromEnv(env);
      const explicitApiKey = asString(env.COMPANY_DEFAULT_API_KEY, 2000);
      const legacyApiKey = vendorKey === 'gemini'
        ? asString(env.VITE_PLATFORM_DEFAULT_API_KEY || env.VITE_GEMINI_API_KEY, 2000)
        : '';
      const apiKey = explicitApiKey || legacyApiKey;
      if (!apiKey) {
        await store.update((next) => {
          next.envSeedApplied = true;
        });
        return;
      }

      const transportType = asString(env.COMPANY_DEFAULT_TRANSPORT || env.VITE_PLATFORM_DEFAULT_TRANSPORT, 40)
        || defaultTransportForVendor(vendorKey);
      const baseUrl = asString(
        env.COMPANY_DEFAULT_BASE_URL || env.VITE_PLATFORM_DEFAULT_BASE_URL,
        2000
      ) || defaultBaseUrlForVendor(vendorKey, transportType);
      const modelName = asString(
        env.COMPANY_DEFAULT_MODEL || env.VITE_PLATFORM_DEFAULT_MODEL,
        200
      ) || (vendorKey === 'gemini' ? 'gemini-2.5-pro' : '');
      const models = modelName
        ? [{
            name: modelName,
            enabled: true,
            capabilities: {
              supportsPdfUpload: transportType === 'gemini_native',
              supportsJsonMode: true,
              supportsVision: ['gemini_native', 'openai_compatible'].includes(transportType),
              supportsStreaming: transportType === 'openai_compatible'
            }
          }]
        : [];

      await store.createConnection({
        name: asString(env.COMPANY_DEFAULT_NAME || env.VITE_PLATFORM_DEFAULT_PRESET_NAME, 80)
          || '团队模型',
        transportType,
        vendorKey,
        baseUrl,
        apiKey,
        enabled: true,
        models
      });
      await store.update((next) => {
        next.envSeedApplied = true;
      });
      logger.info?.('config_seeded_company_connection', { transportType, vendorKey, modelName, modelCount: models.length });
    },

    async update(mutator) {
      if (typeof mutator !== 'function') {
        throw new ConfigValidationError('配置更新需要传入函数。');
      }

      const operation = writeQueue.then(async () => {
        const next = structuredClone(config);
        mutator(next);
        const normalized = normalizeConfig({
          ...next,
          updatedAt: nowIso(now)
        }, { now });
        await writeConfigFile(filePath, normalized);
        config = normalized;
      });

      writeQueue = operation.catch(() => {});
      await operation;
      return store.get();
    },

    async createConnection(input) {
      let created = null;
      await store.update((next) => {
        if (next.companyConnections.length >= MAX_CONNECTIONS) {
          throw new ConfigValidationError(`公司连接数量不能超过 ${MAX_CONNECTIONS} 个。`);
        }
        const connection = normalizeConnection(input, { now });
        next.companyConnections.push(connection);
        created = toAdminConnection(connection);
      });
      return created;
    },

    async updateConnection(id, input) {
      let updated = null;
      await store.update((next) => {
        const index = next.companyConnections.findIndex((item) => item.id === id);
        if (index < 0) {
          return;
        }
        const connection = normalizeConnection({
          ...next.companyConnections[index],
          ...input,
          id
        }, { now, existing: next.companyConnections[index] });
        next.companyConnections[index] = connection;
        updated = toAdminConnection(connection);
      });
      return updated;
    },

    async deleteConnection(id) {
      let deleted = false;
      await store.update((next) => {
        const before = next.companyConnections.length;
        next.companyConnections = next.companyConnections.filter((item) => item.id !== id);
        deleted = next.companyConnections.length !== before;
      });
      return deleted;
    },

    async updatePages(rawPages) {
      await store.update((next) => {
        next.pages = normalizePageConfig(rawPages);
      });
      return store.get().pages;
    },

    getConnectionWithSecret(id) {
      return config.companyConnections.find((item) => item.id === id) || null;
    },

    listAdminConnections() {
      return config.companyConnections.map(toAdminConnection);
    },

    getAdminConnection(id) {
      const connection = config.companyConnections.find((item) => item.id === id);
      return connection ? toAdminConnection(connection) : null;
    },

    toPublicConfig() {
      return {
        version: config.version,
        updatedAt: config.updatedAt,
        companyConnections: config.companyConnections.map(toPublicConnection),
        pages: structuredClone(config.pages)
      };
    }
  };

  return store;
}
