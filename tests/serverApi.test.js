import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../server/app.js';

const ADMIN_HEADER = { 'X-LLM-Lab-Admin': '1' };
const CLIENT_HEADER = { 'X-LLM-Lab-Client': 'web' };
const logger = { info() {}, warn() {}, error() {} };

async function startServer({ configPath, fetchImpl }) {
  const app = await createApp({
    configPath,
    env: {
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test-admin-password',
      AUTO_SEED_COMPANY: 'false',
      ADMIN_LOGIN_MAX_FAILURES: '20'
    },
    fetchImpl,
    logger,
    serveStatic: false
  });
  const server = app.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    app,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.close();
      await once(server, 'close');
      await app.close();
    }
  };
}

async function request(baseUrl, pathname, { method = 'GET', body, headers = {}, cookie = '' } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (cookie) {
    finalHeaders.Cookie = cookie;
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    payload = null;
  }
  return { response, payload };
}

async function login(baseUrl) {
  const { response, payload } = await request(baseUrl, '/api/admin/login', {
    method: 'POST',
    headers: ADMIN_HEADER,
    body: { username: 'admin', password: 'test-admin-password' }
  });
  assert.equal(response.status, 200, JSON.stringify(payload));
  const setCookie = response.headers.get('set-cookie') || '';
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  return setCookie.split(';')[0];
}

test('M1 HTTP 接口：管理员鉴权、公司连接、公开配置与安全转发', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'llm-lab-api-'));
  const configPath = path.join(dir, 'config.json');
  const calls = [];
  let upstreamMode = 'ok';

  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'GET' && String(url).endsWith('/models')) {
      return new Response(JSON.stringify({
        data: [{ id: 'model-a' }, { id: 'model-b' }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (upstreamMode === 'error') {
      return new Response(JSON.stringify({ error: 'upstream failed fake-company-key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 8, completion_tokens: 3 }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  let server = await startServer({ configPath, fetchImpl });
  let runId = '';
  async function authorize(pageKey = 'prompt-iteration') {
    return request(server.baseUrl, '/api/runs/authorize', {
      method: 'POST',
      headers: CLIENT_HEADER,
      body: { pageKey }
    });
  }
  t.after(async () => {
    if (server) {
      await server.close();
    }
    await rm(dir, { recursive: true, force: true });
  });

  await t.test('健康检查与公开配置无需登录', async () => {
    const health = await request(server.baseUrl, '/api/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.ok, true);

    const publicConfig = await request(server.baseUrl, '/api/public/config');
    assert.equal(publicConfig.response.status, 200);
    assert.deepEqual(publicConfig.payload.companyConnections, []);
    assert.equal(publicConfig.payload.pages['online-validation'].enabled, true);
  });

  await t.test('管理登录受 CSRF 请求头和凭据校验保护', async () => {
    const noHeader = await request(server.baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'test-admin-password' }
    });
    assert.equal(noHeader.response.status, 403);

    const wrongPassword = await request(server.baseUrl, '/api/admin/login', {
      method: 'POST',
      headers: ADMIN_HEADER,
      body: { username: 'admin', password: 'wrong-password' }
    });
    assert.equal(wrongPassword.response.status, 401);

    const crossOrigin = await request(server.baseUrl, '/api/admin/login', {
      method: 'POST',
      headers: { ...ADMIN_HEADER, Origin: 'https://evil.example' },
      body: { username: 'admin', password: 'test-admin-password' }
    });
    assert.equal(crossOrigin.response.status, 403);
  });

  let cookie = '';
  let connectionId = '';
  await t.test('登录后可创建公司连接，响应不回传 Key', async () => {
    cookie = await login(server.baseUrl);

    const unauth = await request(server.baseUrl, '/api/admin/connections');
    assert.equal(unauth.response.status, 401);

    const noCsrf = await request(server.baseUrl, '/api/admin/connections', {
      method: 'POST',
      cookie,
      body: {
        name: '公司 OneAPI',
        transportType: 'openai_compatible',
        vendorKey: 'oneapi',
        baseUrl: 'https://upstream.example/v1',
        apiKey: 'fake-company-key',
        models: [{ name: 'model-a', capabilities: { supportsJsonMode: true } }]
      }
    });
    assert.equal(noCsrf.response.status, 403);

    const created = await request(server.baseUrl, '/api/admin/connections', {
      method: 'POST',
      headers: ADMIN_HEADER,
      cookie,
      body: {
        name: '公司 OneAPI',
        transportType: 'openai_compatible',
        vendorKey: 'oneapi',
        baseUrl: 'https://upstream.example/v1',
        apiKey: 'fake-company-key',
        models: [{ name: 'model-a', capabilities: { supportsJsonMode: true } }]
      }
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    connectionId = created.payload.connection.id;
    assert.equal(created.payload.connection.keyConfigured, true);
    assert.equal('apiKey' in created.payload.connection, false);

    const listed = await request(server.baseUrl, '/api/admin/connections', { cookie });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.connections.length, 1);
    assert.equal(JSON.stringify(listed.payload).includes('fake-company-key'), false);
  });

  await t.test('管理员可以 Ping 公司连接模型列表，不返回 Key', async () => {
    const unauth = await request(server.baseUrl, `/api/admin/connections/${encodeURIComponent(connectionId)}/models`);
    assert.equal(unauth.response.status, 401);

    const probed = await request(server.baseUrl, `/api/admin/connections/${encodeURIComponent(connectionId)}/models`, { cookie });
    assert.equal(probed.response.status, 200, JSON.stringify(probed.payload));
    assert.deepEqual(probed.payload.models, ['model-a', 'model-b']);
    assert.equal(JSON.stringify(probed.payload).includes('fake-company-key'), false);

    const callsBefore = calls.length;
    await request(server.baseUrl, `/api/admin/connections/${encodeURIComponent(connectionId)}/models`, { cookie });
    assert.equal(calls.length, callsBefore + 1);
  });

  await t.test('公开配置只暴露连接标识、模型和能力，不暴露 Key 与 Base URL', async () => {
    const publicConfig = await request(server.baseUrl, '/api/public/config');
    const connection = publicConfig.payload.companyConnections[0];
    assert.equal(connection.id, connectionId);
    assert.equal(connection.keyConfigured, true);
    assert.equal('apiKey' in connection, false);
    assert.equal('baseUrl' in connection, false);
    assert.equal(connection.models[0].name, 'model-a');
    assert.equal(JSON.stringify(publicConfig.payload).includes('fake-company-key'), false);
  });

  await t.test('公司模型转发要求客户端标记，并只使用服务端地址和 Key', async () => {
    const authorization = await authorize('prompt-iteration');
    assert.equal(authorization.response.status, 200, JSON.stringify(authorization.payload));
    runId = authorization.payload.runId;
    calls.length = 0;

    const body = {
      connectionId,
      model: 'model-a',
      pageKey: 'prompt-iteration',
      runId,
      systemPrompt: 'system',
      userPrompt: 'user'
    };

    const noClient = await request(server.baseUrl, '/api/llm/company', {
      method: 'POST',
      body
    });
    assert.equal(noClient.response.status, 403);

    const success = await request(server.baseUrl, '/api/llm/company', {
      method: 'POST',
      headers: CLIENT_HEADER,
      body
    });
    assert.equal(success.response.status, 200, JSON.stringify(success.payload));
    assert.equal(success.payload.text, '{"ok":true}');
    assert.deepEqual(success.payload.usage, { input_tokens: 8, output_tokens: 3 });
    assert.equal(JSON.stringify(success.payload).includes('fake-company-key'), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://upstream.example/v1/chat/completions');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer fake-company-key');

    const forbidden = await request(server.baseUrl, '/api/llm/company', {
      method: 'POST',
      headers: CLIENT_HEADER,
      body: { ...body, apiUrl: 'https://evil.example' }
    });
    assert.equal(forbidden.response.status, 400);

    const crossOrigin = await request(server.baseUrl, '/api/llm/company', {
      method: 'POST',
      headers: { ...CLIENT_HEADER, Origin: 'https://evil.example' },
      body
    });
    assert.equal(crossOrigin.response.status, 403);
  });

  await t.test('上游错误返回脱敏提示，不泄露公司 Key', async () => {
    upstreamMode = 'error';
    const failed = await request(server.baseUrl, '/api/llm/company', {
      method: 'POST',
      headers: CLIENT_HEADER,
      body: {
        connectionId,
        model: 'model-a',
        pageKey: 'prompt-iteration',
        runId,
        systemPrompt: 'system',
        userPrompt: 'user'
      }
    });
    assert.equal(failed.response.status, 502);
    assert.equal(JSON.stringify(failed.payload).includes('fake-company-key'), false);

    const testResult = await request(server.baseUrl, '/api/admin/connections/' + encodeURIComponent(connectionId) + '/test', {
      method: 'POST',
      headers: ADMIN_HEADER,
      cookie,
      body: {}
    });
    assert.equal(testResult.response.status, 502);
    assert.equal(JSON.stringify(testResult.payload).includes('fake-company-key'), false);
    upstreamMode = 'ok';
  });

  await t.test('Key 留空保留，清除标记才会删除；清除后转发明确失败', async () => {
    const keep = await request(server.baseUrl, '/api/admin/connections/' + encodeURIComponent(connectionId), {
      method: 'PUT',
      headers: ADMIN_HEADER,
      cookie,
      body: { name: '公司 OneAPI 更新', apiKey: '' }
    });
    assert.equal(keep.response.status, 200);
    assert.equal(keep.payload.connection.keyConfigured, true);

    const cleared = await request(server.baseUrl, '/api/admin/connections/' + encodeURIComponent(connectionId), {
      method: 'PUT',
      headers: ADMIN_HEADER,
      cookie,
      body: { clearApiKey: true }
    });
    assert.equal(cleared.response.status, 200);
    assert.equal(cleared.payload.connection.keyConfigured, false);

    const failed = await request(server.baseUrl, '/api/llm/company', {
      method: 'POST',
      headers: CLIENT_HEADER,
      body: {
        connectionId,
        model: 'model-a',
        pageKey: 'prompt-iteration',
        runId,
        systemPrompt: 'system',
        userPrompt: 'user'
      }
    });
    assert.equal(failed.response.status, 409);
    assert.equal(failed.payload.error.code, 'CONNECTION_KEY_MISSING');
  });

  await t.test('页面开关拒绝新运行授权，已授权运行仍可继续', async () => {
    const restored = await request(server.baseUrl, '/api/admin/connections/' + encodeURIComponent(connectionId), {
      method: 'PUT',
      headers: ADMIN_HEADER,
      cookie,
      body: { apiKey: 'fake-company-key' }
    });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.payload.connection.keyConfigured, true);

    const existing = await authorize('prompt-iteration');
    assert.equal(existing.response.status, 200);
    const existingRunId = existing.payload.runId;

    const pagesBefore = await request(server.baseUrl, '/api/admin/pages', { cookie });
    assert.equal(pagesBefore.response.status, 200);
    assert.equal(pagesBefore.payload.pages['prompt-iteration'].enabled, true);

    const closed = await request(server.baseUrl, '/api/admin/pages', {
      method: 'PUT',
      headers: ADMIN_HEADER,
      cookie,
      body: {
        pages: {
          'prompt-iteration': { enabled: false, defaults: { maxRetries: 4 } }
        }
      }
    });
    assert.equal(closed.response.status, 200, JSON.stringify(closed.payload));
    assert.equal(closed.payload.pages['prompt-iteration'].enabled, false);
    assert.equal(closed.payload.pages['prompt-iteration'].defaults.maxRetries, 4);

    const denied = await authorize('prompt-iteration');
    assert.equal(denied.response.status, 409);
    assert.equal(denied.payload.error.code, 'PAGE_CLOSED');

    const stillRuns = await request(server.baseUrl, '/api/llm/company', {
      method: 'POST',
      headers: CLIENT_HEADER,
      body: {
        connectionId,
        model: 'model-a',
        pageKey: 'prompt-iteration',
        runId: existingRunId,
        systemPrompt: 'system',
        userPrompt: 'user'
      }
    });
    assert.equal(stillRuns.response.status, 200);

    const reopened = await request(server.baseUrl, '/api/admin/pages', {
      method: 'PUT',
      headers: ADMIN_HEADER,
      cookie,
      body: {
        pages: {
          'prompt-iteration': { enabled: true, defaults: { maxRetries: 4 } }
        }
      }
    });
    assert.equal(reopened.response.status, 200);
    assert.equal(reopened.payload.pages['prompt-iteration'].enabled, true);
  });

  await t.test('公司转发缺少运行授权时被拒绝', async () => {
    const missingRun = await request(server.baseUrl, '/api/llm/company', {
      method: 'POST',
      headers: CLIENT_HEADER,
      body: {
        connectionId,
        model: 'model-a',
        pageKey: 'prompt-iteration',
        systemPrompt: 'system',
        userPrompt: 'user'
      }
    });
    assert.equal(missingRun.response.status, 403);
    assert.equal(missingRun.payload.error.code, 'RUN_NOT_AUTHORIZED');
  });

  await t.test('跨站管理写入被拒绝，退出后管理接口失效', async () => {
    const crossOrigin = await request(server.baseUrl, '/api/admin/connections/' + encodeURIComponent(connectionId), {
      method: 'PUT',
      headers: { ...ADMIN_HEADER, Origin: 'https://evil.example' },
      cookie,
      body: { clearApiKey: true }
    });
    assert.equal(crossOrigin.response.status, 403);

    const logout = await request(server.baseUrl, '/api/admin/logout', {
      method: 'POST',
      headers: ADMIN_HEADER,
      cookie,
      body: {}
    });
    assert.equal(logout.response.status, 200);

    const afterLogout = await request(server.baseUrl, '/api/admin/connections', { cookie });
    assert.equal(afterLogout.response.status, 401);
  });

  await t.test('重启服务后公司配置仍然保留，Key 仍只显示配置状态', async () => {
    await server.close();
    server = await startServer({ configPath, fetchImpl });

    cookie = await login(server.baseUrl);
    const listed = await request(server.baseUrl, '/api/admin/connections', { cookie });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.connections.length, 1);
    assert.equal(listed.payload.connections[0].name, '公司 OneAPI 更新');
    assert.equal(listed.payload.connections[0].keyConfigured, true);
    assert.equal(JSON.stringify(listed.payload).includes('fake-company-key'), false);
  });
});
