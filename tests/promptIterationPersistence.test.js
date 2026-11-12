import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deleteFile,
  getPromptIterationDraft,
  getPromptIterationHistory,
  listFiles,
  restorePromptIterationDraftFiles,
  saveFile,
  savePromptIterationDraft,
  savePromptIterationDraftFiles,
  savePromptIterationHistory
} from '../src/services/persistenceService.js';

test('PromptIteration draft 可保存并读回', async () => {
  const draft = {
    name: '范围一',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取结果',
    files: [{ id: 'file-1', pageSpec: '1-2' }]
  };

  await savePromptIterationDraft(draft);

  assert.deepEqual(await getPromptIterationDraft(), draft);
});

test('PromptIteration draft 可恢复已持久化的 PDF，且不会影响其他 files 记录', async () => {
  const file = new File([Uint8Array.from([1, 2, 3])], 'A.pdf', {
    type: 'application/pdf',
    lastModified: 123456
  });
  const draft = {
    name: '范围一',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取结果',
    files: [{ id: 'file-1', name: 'A.pdf', type: 'application/pdf', pageSpec: '1-2' }]
  };

  await deleteFile('validation_test__keep').catch(() => {});
  await saveFile('validation_test__keep', 'keep.xlsx', 'validation_test', Uint8Array.from([9]).buffer, 789);
  await savePromptIterationDraft(draft);
  await savePromptIterationDraftFiles([
    { ...draft.files[0], file }
  ]);

  const restoredDraft = await restorePromptIterationDraftFiles(await getPromptIterationDraft());
  const restoredFile = restoredDraft.files[0].file;

  assert.equal(restoredFile instanceof File, true);
  assert.equal(restoredFile.name, 'A.pdf');
  assert.equal(restoredFile.type, 'application/pdf');
  assert.equal(restoredFile.lastModified, 123456);
  assert.deepEqual(
    Array.from(new Uint8Array(await restoredFile.arrayBuffer())),
    [1, 2, 3]
  );

  const unrelatedFiles = await listFiles('validation_test');
  assert.equal(unrelatedFiles.some((item) => item.id === 'validation_test__keep'), true);
});

test('PromptIteration draft 文件删除后会清理孤儿 PDF 记录', async () => {
  const file = new File([Uint8Array.from([4, 5])], 'B.pdf', {
    type: 'application/pdf',
    lastModified: 456789
  });

  await savePromptIterationDraftFiles([
    { id: 'file-cleanup', name: 'B.pdf', type: 'application/pdf', pageSpec: '', file }
  ]);
  assert.equal((await listFiles()).some((item) => item.id === 'prompt_iteration__file-cleanup'), true);

  await savePromptIterationDraftFiles([]);

  assert.equal((await listFiles()).some((item) => item.id === 'prompt_iteration__file-cleanup'), false);
});

test('PromptIteration history 默认空数组且可覆盖保存', async () => {
  await savePromptIterationHistory([]);
  assert.deepEqual(await getPromptIterationHistory(), []);

  const history = [
    { createdAt: 1000, name: '范围二', results: [] },
    { createdAt: 2000, name: '范围三', results: [{ fileId: 'a', status: 'success' }] }
  ];

  await savePromptIterationHistory(history);

  assert.deepEqual(await getPromptIterationHistory(), history);
});
