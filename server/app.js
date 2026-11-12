import { createServer } from 'node:http';

import { createAuthService, SESSION_COOKIE, parseCookies } from './auth.js';
import { createConfigStore, ConfigValidationError, DEFAULT_CONFIG_PATH } from './configStore.js';
import { createCompanyProxy } from './companyProxy.js';
import { HttpError } from './errors.js';
import {
  getClientIp,
  getRequestUrl,
  isSameOrigin,
  methodNotAllowed,
  readJsonBody,
  requireHeader,
  sendError,
  sendJson,
  sendNoContent,
  setSecurityHeaders
} from './httpUtils.js';
import { createLoginRateLimiter, createRequestRateLimiter } from './rateLimit.js';
import { createRunAuthorizationStore } from './runAuthorization.js';
import { createStaticHandler } from './static.js';

const ADMIN_HEADER = 'x-llm-lab-admin';
const CLIENT_HEADER = 'x-llm-lab-client';
const DEFAULT_PROXY_BODY_BYTES = 50 * 1024 * 1024;
const DEFAULT_ADMIN_BODY_BYTES = 1024 * 1024;

function parseBoolean(value) {
  return String(value || '').toLowerCase() === 'true';
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function requireAdminWrite(req, auth, { trustProxy, allowedOrigins }) {
  const session = auth.getSessionFromRequest(req);
  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', '请先登录管理员账号。');
  }
  requireHeader(req, ADMIN_HEADER);
  if (!isSameOrigin(req, { trustProxy, allowedOrigins })) {
    throw new HttpError(403, 'CROSS_ORIGIN_FORBIDDEN', '不允许跨站执行管理操作。');
  }
  return session;
}

function requireAdminRead(req, auth) {
  const session = auth.getSessionFromRequest(req);
  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', '请先登录管理员账号。');
  }
  return session;
}

function mapConfigError(error) {
  if (error instanceof ConfigValidationError) {
    return new HttpError(400, 'INVALID_CONFIG', error.message);
  }
  return error;
}

export async function createApp({
  configPath = DEFAULT_CONFIG_PATH,
  env = process.env,
  logger = console,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  sessionTtlMs = parseNumber(env.ADMIN_SESSION_TTL_MS, 8 * 60 * 60 * 1000),
  serveStatic = false,
  distDir = undefined
} = {}) {
  const trustProxy = parseBoolean(env.TRUST_PROXY);
  const allowedOrigins = parseList(env.ALLOWED_ORIGINS);
  const proxyBodyLimit = parseNumber(env.MAX_PROXY_BODY_BYTES, DEFAULT_PROXY_BODY_BYTES);
  const adminBodyLimit = parseNumber(env.MAX_ADMIN_BODY_BYTES, DEFAULT_ADMIN_BODY_BYTES);

  const configStore = createConfigStore({ filePath: configPath, env, logger, now });
  await configStore.load();
  await configStore.ensureAdminFromEnv();
  await configStore.seedCompanyFromEnv();

  const auth = createAuthService({ configStore, env, now, sessionTtlMs });
  const proxy = createCompanyProxy({ configStore, env, fetchImpl, logger, now });
  const loginLimiter = createLoginRateLimiter({
    maxFailures: parseNumber(env.ADMIN_LOGIN_MAX_FAILURES, 5),
    windowMs: parseNumber(env.ADMIN_LOGIN_WINDOW_MS, 10 * 60 * 1000),
    blockMs: parseNumber(env.ADMIN_LOGIN_BLOCK_MS, 10 * 60 * 1000),
    now
  });
  const proxyLimiter = createRequestRateLimiter({
    limit: parseNumber(env.PROXY_RATE_LIMIT_PER_MINUTE, 600),
    windowMs: 60 * 1000,
    now
  });
  const runStore = createRunAuthorizationStore({
    ttlMs: parseNumber(env.RUN_AUTH_TTL_MS, 2 * 60 * 60 * 1000),
    now
  });
  const staticHandler = serveStatic ? createStaticHandler({ distDir, logger }) : null;

  const cleanupTimer = setInterval(() => {
    auth.cleanup();
    loginLimiter.cleanup();
    proxyLimiter.cleanup();
    runStore.cleanup();
  }, 5 * 60 * 1000);
  cleanupTimer.unref?.();

  function requireGlobalAdmin(req) {
    return requireAdminRead(req, auth);
  }

  async function handleAdminLogin(req, res) {
    if (req.method !== 'POST') {
      methodNotAllowed(res, ['POST']);
      return;
    }

    requireHeader(req, ADMIN_HEADER);
    if (!isSameOrigin(req, { trustProxy, allowedOrigins })) {
      throw new HttpError(403, 'CROSS_ORIGIN_FORBIDDEN', '不允许跨站登录。');
    }

    const ip = getClientIp(req, { trustProxy });
    const limit = loginLimiter.check(ip);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      throw new HttpError(429, 'LOGIN_RATE_LIMITED', '登录失败次数过多，请稍后再试。');
    }

    const body = await readJsonBody(req, { limit: adminBodyLimit });
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) {
      throw new HttpError(400, 'CREDENTIALS_REQUIRED', '请输入管理员用户名和密码。');
    }

    if (!auth.verifyCredentials(username, password)) {
      loginLimiter.fail(ip);
      throw new HttpError(401, 'INVALID_CREDENTIALS', '管理员用户名或密码不正确。');
    }

    loginLimiter.reset(ip);
    const token = auth.createSession(username);
    res.setHeader('Set-Cookie', auth.buildCookie(token));
    sendJson(res, 200, { ok: true, username });
  }

  async function handleAdminLogout(req, res) {
    if (req.method !== 'POST') {
      methodNotAllowed(res, ['POST']);
      return;
    }
    requireHeader(req, ADMIN_HEADER);
    if (!isSameOrigin(req, { trustProxy, allowedOrigins })) {
      throw new HttpError(403, 'CROSS_ORIGIN_FORBIDDEN', '不允许跨站退出。');
    }

    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    auth.destroySession(token);
    res.setHeader('Set-Cookie', auth.buildClearCookie());
    sendJson(res, 200, { ok: true });
  }

  function handleAdminSession(req, res) {
    if (req.method !== 'GET') {
      methodNotAllowed(res, ['GET']);
      return;
    }
    const session = auth.getSessionFromRequest(req);
    sendJson(res, 200, {
      authenticated: Boolean(session),
      username: session?.username || ''
    });
  }

  async function handleConnections(req, res, connectionId, isTest) {
    if (isTest) {
      if (req.method !== 'POST') {
        methodNotAllowed(res, ['POST']);
        return;
      }
      requireAdminWrite(req, auth, { trustProxy, allowedOrigins });
      const body = await readJsonBody(req, { limit: adminBodyLimit });
      const result = await proxy.testConnection(connectionId, body.model);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET') {
      requireGlobalAdmin(req);
      sendJson(res, 200, { connections: configStore.listAdminConnections() });
      return;
    }

    if (req.method === 'POST' && !connectionId) {
      requireAdminWrite(req, auth, { trustProxy, allowedOrigins });
      const body = await readJsonBody(req, { limit: adminBodyLimit });
      try {
        const connection = await configStore.createConnection(body);
        sendJson(res, 201, { connection });
      } catch (error) {
        throw mapConfigError(error);
      }
      return;
    }

    if (!connectionId) {
      methodNotAllowed(res, ['GET', 'POST']);
      return;
    }

    if (req.method === 'PUT') {
      requireAdminWrite(req, auth, { trustProxy, allowedOrigins });
      const body = await readJsonBody(req, { limit: adminBodyLimit });
      try {
        const connection = await configStore.updateConnection(connectionId, body);
        if (!connection) {
          throw new HttpError(404, 'CONNECTION_NOT_FOUND', '公司连接不存在。');
        }
        sendJson(res, 200, { connection });
      } catch (error) {
        throw mapConfigError(error);
      }
      return;
    }

    if (req.method === 'DELETE') {
      requireAdminWrite(req, auth, { trustProxy, allowedOrigins });
      const deleted = await configStore.deleteConnection(connectionId);
      if (!deleted) {
        throw new HttpError(404, 'CONNECTION_NOT_FOUND', '公司连接不存在。');
      }
      sendNoContent(res);
      return;
    }

    methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE']);
  }

  async function handlePages(req, res) {
    if (req.method === 'GET') {
      requireGlobalAdmin(req);
      sendJson(res, 200, { pages: configStore.get().pages });
      return;
    }
    if (req.method === 'PUT') {
      requireAdminWrite(req, auth, { trustProxy, allowedOrigins });
      const body = await readJsonBody(req, { limit: adminBodyLimit });
      if (!body.pages || typeof body.pages !== 'object' || Array.isArray(body.pages)) {
        throw new HttpError(400, 'INVALID_PAGES', '页面配置必须是对象。');
      }
      try {
        const pages = await configStore.updatePages(body.pages);
        sendJson(res, 200, { pages });
      } catch (error) {
        throw mapConfigError(error);
      }
      return;
    }
    methodNotAllowed(res, ['GET', 'PUT']);
  }

  async function handler(req, res) {
    const startedAt = now();
    setSecurityHeaders(res);

    res.on('finish', () => {
      logger.info?.('http_request', {
        method: req.method,
        path: String(req.url || '').split('?')[0],
        status: res.statusCode,
        durationMs: now() - startedAt,
        ip: getClientIp(req, { trustProxy })
      });
    });

    try {
      const url = getRequestUrl(req);
      const pathname = url.pathname;

      if (pathname === '/api/health') {
        if (req.method !== 'GET') {
          methodNotAllowed(res, ['GET']);
          return;
        }
        sendJson(res, 200, { ok: true, version: 1, time: new Date(now()).toISOString() });
        return;
      }

      if (pathname === '/api/public/config') {
        if (req.method !== 'GET') {
          methodNotAllowed(res, ['GET']);
          return;
        }
        sendJson(res, 200, configStore.toPublicConfig());
        return;
      }

      if (pathname === '/api/runs/authorize') {
        if (req.method !== 'POST') {
          methodNotAllowed(res, ['POST']);
          return;
        }
        requireHeader(req, CLIENT_HEADER, 'web');
        if (!isSameOrigin(req, { trustProxy, allowedOrigins })) {
          throw new HttpError(403, 'CROSS_ORIGIN_FORBIDDEN', '不允许跨站申请运行授权。');
        }
        const body = await readJsonBody(req, { limit: adminBodyLimit });
        const pageKey = String(body.pageKey || '').trim();
        const pages = configStore.get().pages;
        if (!pageKey || !Object.prototype.hasOwnProperty.call(pages, pageKey)) {
          throw new HttpError(400, 'INVALID_PAGE_KEY', '页面标识无效。');
        }
        if (pages[pageKey].enabled === false) {
          throw new HttpError(409, 'PAGE_CLOSED', '该页面已在后台关闭，不能启动新任务。');
        }
        const authorization = runStore.authorize(pageKey);
        sendJson(res, 200, authorization);
        return;
      }

      if (pathname === '/api/llm/company') {
        if (req.method !== 'POST') {
          methodNotAllowed(res, ['POST']);
          return;
        }
        requireHeader(req, CLIENT_HEADER, 'web');
        if (!isSameOrigin(req, { trustProxy, allowedOrigins })) {
          throw new HttpError(403, 'CROSS_ORIGIN_FORBIDDEN', '不允许跨站调用公司模型接口。');
        }
        const ip = getClientIp(req, { trustProxy });
        const limit = proxyLimiter.check(ip);
        if (!limit.allowed) {
          res.setHeader('Retry-After', String(limit.retryAfterSec));
          throw new HttpError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试。');
        }
        const body = await readJsonBody(req, { limit: proxyBodyLimit });
        const pageKey = String(body.pageKey || '').trim();
        const runId = String(body.runId || '').trim();
        if (!pageKey) {
          throw new HttpError(400, 'PAGE_KEY_REQUIRED', '公司模型请求缺少页面标识。');
        }
        if (!runStore.validate(runId, pageKey)) {
          throw new HttpError(403, 'RUN_NOT_AUTHORIZED', '运行授权无效或已过期，请重新启动任务。');
        }
        const result = await proxy.handle(body);
        sendJson(res, 200, result);
        return;
      }

      if (pathname === '/api/admin/login') {
        await handleAdminLogin(req, res);
        return;
      }

      if (pathname === '/api/admin/logout') {
        await handleAdminLogout(req, res);
        return;
      }

      if (pathname === '/api/admin/session') {
        handleAdminSession(req, res);
        return;
      }

      if (pathname === '/api/admin/pages') {
        await handlePages(req, res);
        return;
      }

      const modelProbeMatch = pathname.match(/^\/api\/admin\/connections\/([^/]+)\/models$/);
      if (modelProbeMatch) {
        if (req.method !== 'GET') {
          methodNotAllowed(res, ['GET']);
          return;
        }
        requireGlobalAdmin(req);
        let connectionId = '';
        try {
          connectionId = decodeURIComponent(modelProbeMatch[1]);
        } catch (_) {
          throw new HttpError(400, 'INVALID_CONNECTION_ID', '连接标识无效。');
        }
        const result = await proxy.listModels(connectionId);
        sendJson(res, 200, result);
        return;
      }

      const connectionMatch = pathname.match(/^\/api\/admin\/connections(?:\/([^/]+))?(\/test)?$/);
      if (connectionMatch) {
        let connectionId = '';
        try {
          connectionId = connectionMatch[1] ? decodeURIComponent(connectionMatch[1]) : '';
        } catch (_) {
          throw new HttpError(400, 'INVALID_CONNECTION_ID', '连接标识无效。');
        }
        await handleConnections(req, res, connectionId, Boolean(connectionMatch[2]));
        return;
      }

      if (pathname.startsWith('/api/')) {
        throw new HttpError(404, 'API_NOT_FOUND', '接口不存在。');
      }

      if (staticHandler) {
        await staticHandler(req, res, pathname);
        return;
      }

      throw new HttpError(404, 'NOT_FOUND', '页面不存在。开发模式请访问 Vite 开发服务器。');
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status >= 500) {
          logger.error?.('http_error', {
            method: req.method,
            path: String(req.url || '').split('?')[0],
            code: error.code,
            status: error.status
          });
        }
        sendError(res, error);
        return;
      }
      if (error instanceof ConfigValidationError) {
        sendError(res, mapConfigError(error));
        return;
      }
      logger.error?.('http_unhandled_error', {
        method: req.method,
        path: String(req.url || '').split('?')[0],
        message: error?.message || 'unknown'
      });
      sendError(res, error);
    }
  }

  return {
    handler,
    configStore,
    auth,
    proxy,
    runStore,
    async close() {
      clearInterval(cleanupTimer);
    },
    createServer() {
      return createServer(handler);
    }
  };
}
