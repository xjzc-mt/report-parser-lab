import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('package.json 声明 jszip 依赖版本', () => {
  assert.equal(packageJson.dependencies.jszip, '^3.10.1');
});
