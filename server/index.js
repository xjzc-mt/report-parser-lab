import path from 'node:path';

import { createApp } from './app.js';

const LOG_PREFIX = '[llm-lab-server]';

function parseBoolean(value) {
  return String(value || '').toLowerCase() === 'true';
}

function fail(message) {
  console.error(`${LOG_PREFIX} ${message}`);
  process.exitCode = 1;
}

async function main() {
  const env = process.env;
  const port = Number(env.PORT || 8787);
  const host = String(env.HOST || '127.0.0.1').trim() || '127.0.0.1';
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail(`PORT 无效：${env.PORT}`);
    return;
  }

  const serveStatic = env.SERVE_STATIC === undefined
    ? true
    : parseBoolean(env.SERVE_STATIC);

  let app;
  try {
    app = await createApp({
      env,
      configPath: env.LLM_LAB_CONFIG_PATH ? path.resolve(process.cwd(), env.LLM_LAB_CONFIG_PATH) : undefined,
      serveStatic,
      distDir: path.resolve(process.cwd(), 'dist')
    });
  } catch (error) {
    fail(error?.message || '服务初始化失败。');
    return;
  }

  const server = app.createServer();
  server.requestTimeout = 10 * 60 * 1000;
  server.headersTimeout = 60 * 1000;
  server.keepAliveTimeout = 65 * 1000;

  server.on('error', (error) => {
    fail(`监听失败：${error.message}`);
  });

  server.listen(port, host, () => {
    console.log(`${LOG_PREFIX} listening on http://${host}:${port}`);
    console.log(`${LOG_PREFIX} static=${serveStatic ? 'on' : 'off'} config=${app.configStore.filePath}`);
    console.log(`${LOG_PREFIX} admin=/admin  api=/api  health=/api/health`);
  });

  const shutdown = (signal) => {
    console.log(`${LOG_PREFIX} received ${signal}, shutting down`);
    server.close(() => {
      void app.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
