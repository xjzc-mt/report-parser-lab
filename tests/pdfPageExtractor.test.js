import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPdfPageCacheKey, fingerprintPdfFile } from '../src/services/pdfPageExtractor.js';

function createFile(bytes, name = 'report.pdf') {
  return {
    name,
    async arrayBuffer() {
      return new Uint8Array(bytes).buffer;
    }
  };
}

test('PDF 切页缓存键绑定文件内容指纹', async () => {
  const first = await fingerprintPdfFile(createFile([1, 2, 3]));
  const second = await fingerprintPdfFile(createFile([4, 5, 6]));
  const same = await fingerprintPdfFile(createFile([1, 2, 3]));

  assert.equal(first.fingerprint, same.fingerprint);
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.notEqual(
    buildPdfPageCacheKey('report.pdf', '1', first.fingerprint),
    buildPdfPageCacheKey('report.pdf', '1', second.fingerprint)
  );
});
