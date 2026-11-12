import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.map', '.txt', '.svg']);
const PUBLIC_ENV_KEYS = [
  'VITE_PLATFORM_DEFAULT_PRESET_NAME',
  'VITE_PLATFORM_DEFAULT_VENDOR',
  'VITE_PLATFORM_DEFAULT_TRANSPORT',
  'VITE_PLATFORM_DEFAULT_BASE_URL',
  'VITE_PLATFORM_DEFAULT_MODEL',
  'VITE_PLATFORM_DEFAULT_REQUEST_OPTIONS'
];

function manualChunks(id) {
  if (!id.includes('/node_modules/')) return undefined;
  if (id.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdfjs';
  if (id.includes('/node_modules/pdf-lib/')) return 'vendor-pdf';
  if (id.includes('/node_modules/xlsx/')) return 'vendor-xlsx';
  if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'vendor-react';
  if (id.includes('/node_modules/@mantine/') || id.includes('/node_modules/@tabler/')) return 'vendor-ui';
  return undefined;
}

function collectSecretValues(env) {
  return Object.entries(env)
    .filter(([key, value]) => (
      /(API_KEY|_KEY|SECRET|PASSWORD|TOKEN)$/i.test(key)
      && typeof value === 'string'
      && value.trim().length >= 8
    ))
    .map(([key, value]) => ({ key, value: value.trim() }));
}

async function scanDirectory(dir, secrets, hits = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return hits;
    throw error;
  }

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(filePath, secrets, hits);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    let text;
    try {
      text = await readFile(filePath, 'utf8');
    } catch (_) {
      continue;
    }
    for (const secret of secrets) {
      if (text.includes(secret.value)) {
        hits.push({ filePath, key: secret.key });
      }
    }
  }
  return hits;
}

function secretLeakGuard(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  const secrets = collectSecretValues(env);

  return {
    name: 'llm-lab-secret-leak-guard',
    apply: 'build',
    async closeBundle() {
      if (secrets.length === 0) {
        return;
      }
      const hits = await scanDirectory(path.resolve(process.cwd(), 'dist'), secrets);
      if (hits.length > 0) {
        const summary = hits
          .map((hit) => `${path.relative(process.cwd(), hit.filePath)} (${hit.key})`)
          .join(', ');
        throw new Error(`构建产物中发现服务端密钥值，已阻止构建：${summary}`);
      }
    }
  };
}

export const viteConfig = {
  plugins: [react()],
  // 不自动把任何 .env 变量注入 import.meta.env；只通过下方 define 暴露白名单。
  envPrefix: [],
  server: {
    proxy: {
      '/api': {
        target: process.env.LLM_LAB_API_PROXY || 'http://127.0.0.1:8787',
        changeOrigin: false
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  }
};

function buildPublicEnv(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  return PUBLIC_ENV_KEYS.reduce((acc, key) => {
    acc[key] = env[key] || '';
    return acc;
  }, {});
}

export default defineConfig(({ mode }) => ({
  ...viteConfig,
  define: {
    __LLM_LAB_PUBLIC_ENV__: JSON.stringify(buildPublicEnv(mode))
  },
  plugins: [...viteConfig.plugins, secretLeakGuard(mode)]
}));
