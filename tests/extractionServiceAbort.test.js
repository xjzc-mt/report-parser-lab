import test from 'node:test';
import assert from 'node:assert/strict';

import { runExtractionJob } from '../src/services/extractionService.js';

test('线上提取在开始前已取消时抛出 AbortError', async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => runExtractionJob({
      pdfFile: null,
      csvFile: null,
      settings: {},
      signal: controller.signal
    }),
    (error) => error.name === 'AbortError'
  );
});
