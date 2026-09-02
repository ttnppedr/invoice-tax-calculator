import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOOKUP_HISTORY_KEY,
  LOOKUP_HISTORY_LIMIT,
  clearLookupHistory,
  loadLookupHistory,
  rememberLookup,
} from '../src/lookup-history.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.hasOwn(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

test('成功查詢會放到最前，相同統編只留一筆', () => {
  const storage = memoryStorage();
  rememberLookup({ taxId: '20828393', name: '宏碁股份有限公司' }, storage);
  rememberLookup({ taxId: '04595252', name: '範例公司' }, storage);
  const again = rememberLookup({ taxId: '20828393', name: '宏碁股份有限公司' }, storage);
  assert.deepEqual(again, [
    { taxId: '20828393', name: '宏碁股份有限公司' },
    { taxId: '04595252', name: '範例公司' },
  ]);
  assert.deepEqual(loadLookupHistory(storage), again);
});

test('超過上限時丟掉最舊的紀錄', () => {
  const storage = memoryStorage();
  for (let i = 0; i < LOOKUP_HISTORY_LIMIT + 2; i += 1) {
    rememberLookup({ taxId: String(10000000 + i), name: `公司${i}` }, storage);
  }
  const items = loadLookupHistory(storage);
  assert.equal(items.length, LOOKUP_HISTORY_LIMIT);
  assert.equal(items[0].taxId, String(10000000 + LOOKUP_HISTORY_LIMIT + 1));
});

test('損壞或不合格資料會略過', () => {
  const storage = memoryStorage({
    [LOOKUP_HISTORY_KEY]: JSON.stringify([
      { taxId: 'nope', name: '壞掉' },
      { taxId: '20828393', name: '  宏碁股份有限公司  ' },
      { taxId: '20828393', name: '重複' },
      'x',
    ]),
  });
  assert.deepEqual(loadLookupHistory(storage), [{ taxId: '20828393', name: '宏碁股份有限公司' }]);
});

test('清除紀錄後是空清單', () => {
  const storage = memoryStorage();
  rememberLookup({ taxId: '20828393', name: '宏碁股份有限公司' }, storage);
  assert.deepEqual(clearLookupHistory(storage), []);
  assert.deepEqual(loadLookupHistory(storage), []);
});
