import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CAPITAL_AMOUNT } from '../src/chinese.js';
import {
  createInvoiceState,
  insertLookupResult,
  resetInvoiceState,
  setAmountFrom,
  setLookupStatus,
  setTaxType,
} from '../src/invoice-state.js';

const NOW = new Date(2026, 7, 31);

test('初始狀態為 idle，期別與日期取自今天', () => {
  const state = createInvoiceState(NOW);
  assert.equal(state.amountSource, 'idle');
  assert.equal(state.sourceValue, null);
  assert.equal(state.taxType, 'taxable');
  assert.deepEqual(state.invoice, { sales: null, tax: null, total: null });
  assert.deepEqual(state.period, { rocYear: 115, startMonth: 7 });
  assert.deepEqual(state.date, { rocYear: 115, month: 8, day: 31 });
});

test('idle → total → idle', () => {
  let state = createInvoiceState(NOW);
  state = setAmountFrom(state, 'total', 105);
  assert.equal(state.amountSource, 'total');
  assert.deepEqual(state.invoice, { sales: 100, tax: 5, total: 105 });
  state = setAmountFrom(state, 'total', null);
  assert.equal(state.amountSource, 'idle');
  assert.deepEqual(state.invoice, { sales: null, tax: null, total: null });
});

test('idle → sales → idle', () => {
  let state = createInvoiceState(NOW);
  state = setAmountFrom(state, 'sales', 100);
  assert.equal(state.amountSource, 'sales');
  assert.deepEqual(state.invoice, { sales: 100, tax: 5, total: 105 });
  state = setAmountFrom(state, 'sales', null);
  assert.equal(state.amountSource, 'idle');
});

test('課稅別切換不改變來源，並重算金額', () => {
  let state = setAmountFrom(createInvoiceState(NOW), 'total', 105);
  state = setTaxType(state, 'zero');
  assert.equal(state.amountSource, 'total');
  assert.equal(state.sourceValue, 105);
  assert.deepEqual(state.invoice, { sales: 105, tax: 0, total: 105 });
  state = setTaxType(state, 'exempt');
  assert.deepEqual(state.invoice, { sales: 105, tax: 0, total: 105 });
  state = setTaxType(state, 'taxable');
  assert.deepEqual(state.invoice, { sales: 100, tax: 5, total: 105 });
});

test('idle 時切換課稅別不產生金額', () => {
  const state = setTaxType(createInvoiceState(NOW), 'zero');
  assert.equal(state.taxType, 'zero');
  assert.deepEqual(state.invoice, { sales: null, tax: null, total: null });
});

test('超出中文大寫範圍時阻止計算', () => {
  const state = setAmountFrom(createInvoiceState(NOW), 'sales', MAX_CAPITAL_AMOUNT + 1);
  assert.equal(state.amountError, 'overflow');
  assert.deepEqual(state.invoice, { sales: null, tax: null, total: null });
});

test('清除重填建立乾淨初始狀態', () => {
  let state = setAmountFrom(createInvoiceState(NOW), 'sales', 100);
  state = setTaxType(state, 'exempt');
  state = setLookupStatus(state, 'success', {
    result: { taxId: '20828393', name: '宏碁股份有限公司' },
    message: '',
  });
  state = insertLookupResult(state);
  state = resetInvoiceState(NOW);
  assert.deepEqual(state, createInvoiceState(NOW));
});
