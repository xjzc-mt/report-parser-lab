import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

test('xlsx 0.20.3 可解析项目内置 Excel 并保持数字、空值和文本标识符', async () => {
  for (const file of ['public/conversion.xlsx', 'public/synonyms.xlsx']) {
    const workbook = XLSX.read(await readFile(file), { type: 'buffer' });
    assert.ok(workbook.SheetNames.length > 0, `${file} 应有工作表`);
  }

  const source = XLSX.utils.aoa_to_sheet([
    ['indicator_code', 'year', 'num_value', 'text_value'],
    ['001001001', 2024, 0, ''],
    ['001001002', 2024, 12.5, '已披露']
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, source, 'Sheet1');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const restored = XLSX.read(bytes, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(restored.Sheets.Sheet1, { raw: true, defval: '' });

  assert.equal(rows[0].indicator_code, '001001001');
  assert.equal(rows[0].num_value, 0);
  assert.equal(rows[0].text_value, '');
  assert.equal(rows[1].num_value, 12.5);
  assert.equal(rows[1].text_value, '已披露');
});
