import test from 'node:test';
import assert from 'node:assert/strict';

import { viteConfig } from '../vite.config.js';

test('vite build 对懒加载大依赖采用显式拆包并放宽 chunk warning 阈值', () => {
  assert.equal(viteConfig.build.chunkSizeWarningLimit, 550);
  assert.equal(typeof viteConfig.build.rollupOptions.output.manualChunks, 'function');

  const manualChunks = viteConfig.build.rollupOptions.output.manualChunks;

  assert.deepEqual(viteConfig.envPrefix, []);
  assert.equal(manualChunks('/node_modules/pdfjs-dist/build/pdf.js'), 'vendor-pdfjs');
  assert.equal(manualChunks('/node_modules/pdf-lib/dist/pdf-lib.esm.js'), 'vendor-pdf');
  assert.equal(manualChunks('/node_modules/xlsx/xlsx.mjs'), 'vendor-xlsx');
  assert.equal(manualChunks('/node_modules/react-dom/client.js'), 'vendor-react');
  assert.equal(manualChunks('/node_modules/react/index.js'), 'vendor-react');
  assert.equal(manualChunks('/node_modules/@mantine/core/esm/index.mjs'), 'vendor-ui');
  assert.equal(manualChunks('/src/components/App.jsx'), undefined);
});
