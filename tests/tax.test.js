import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeInvoice,
  fromExcluded,
  fromIncluded,
  lineAmount,
  parseTwd,
  roundTwd,
  sumAmounts,
} from '../src/tax.js';

test('含稅 105 → 銷售額 100、稅 5', () => {
  assert.deepEqual(fromIncluded(105), { sales: 100, tax: 5, total: 105 });
});

test('未稅 100 → 稅 5、總計 105', () => {
  assert.deepEqual(fromExcluded(100), { sales: 100, tax: 5, total: 105 });
});

test('含稅 1：5/105 四捨五入為 0，銷售額 1', () => {
  assert.deepEqual(fromIncluded(1), { sales: 1, tax: 0, total: 1 });
});

test('未稅 1：0.05 四捨五入至元為 0，總計 1', () => {
  assert.deepEqual(fromExcluded(1), { sales: 1, tax: 0, total: 1 });
});

test('含稅 10：0.476… → 稅 0；未稅 10：0.5 → 稅 1', () => {
  assert.deepEqual(fromIncluded(10), { sales: 10, tax: 0, total: 10 });
  assert.deepEqual(fromExcluded(10), { sales: 10, tax: 1, total: 11 });
});

test('含稅 11 與未稅 10 互為還原', () => {
  assert.deepEqual(fromIncluded(11), { sales: 10, tax: 1, total: 11 });
  assert.deepEqual(fromExcluded(10), { sales: 10, tax: 1, total: 11 });
});

test('零稅率／免稅：稅 0，兩欄相等', () => {
  assert.deepEqual(computeInvoice('zero', 'sales', 100), { sales: 100, tax: 0, total: 100 });
  assert.deepEqual(computeInvoice('exempt', 'total', 250), { sales: 250, tax: 0, total: 250 });
});

test('應稅時 computeInvoice 依來源分流', () => {
  assert.deepEqual(computeInvoice('taxable', 'total', 105), { sales: 100, tax: 5, total: 105 });
  assert.deepEqual(computeInvoice('taxable', 'sales', 100), { sales: 100, tax: 5, total: 105 });
});

test('roundTwd 採四捨五入（0.5 進位）', () => {
  assert.equal(roundTwd(0.049), 0);
  assert.equal(roundTwd(0.05), 0);
  assert.equal(roundTwd(0.5), 1);
  assert.equal(roundTwd(1.5), 2);
  assert.equal(roundTwd(5), 5);
});

test('明細金額與加總', () => {
  assert.equal(lineAmount(3, 40), 120);
  assert.equal(sumAmounts([100, 0, 5]), 105);
});

test('parseTwd 只接受非負整數', () => {
  assert.equal(parseTwd(''), null);
  assert.equal(parseTwd(' 105 '), 105);
  assert.equal(parseTwd('1,050'), 1050);
  assert.equal(parseTwd('10.5'), null);
  assert.equal(parseTwd('-1'), null);
});
