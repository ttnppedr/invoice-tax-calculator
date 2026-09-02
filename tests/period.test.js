import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addCalendarMonths,
  bimonthlyStart,
  currentPeriod,
  formatIsoDate,
  formatPeriod,
  formatRocDateLabel,
  invoiceDateBounds,
  isInvoiceDateAllowed,
  parseIsoDate,
  toRocYear,
  yearToChineseDigits,
} from '../src/period.js';

test('西元 2026 → 民國 115', () => {
  assert.equal(toRocYear(new Date(2026, 7, 30)), 115);
});

test('雙月窗：奇數月起算', () => {
  assert.equal(bimonthlyStart(1), 1);
  assert.equal(bimonthlyStart(2), 1);
  assert.equal(bimonthlyStart(7), 7);
  assert.equal(bimonthlyStart(8), 7);
  assert.equal(bimonthlyStart(12), 11);
});

test('2026-08-30 → 一一五年七、八月份', () => {
  const period = currentPeriod(new Date(2026, 7, 30));
  assert.deepEqual(period, { rocYear: 115, startMonth: 7 });
  assert.equal(formatPeriod(115, 7), '一一五年七、八月份');
  assert.equal(yearToChineseDigits(115), '一一五');
});

test('日曆月加減：沒有的日期落到該月最後一天', () => {
  assert.deepEqual(addCalendarMonths(new Date(2026, 2, 31), -1), new Date(2026, 1, 28));
  assert.deepEqual(addCalendarMonths(new Date(2026, 2, 31), -2), new Date(2026, 0, 31));
  assert.deepEqual(addCalendarMonths(new Date(2026, 0, 31), -2), new Date(2025, 10, 30));
});

test('發票日期從上一期 1 號起到今天', () => {
  const now = new Date(2026, 8, 2);
  const { min, max } = invoiceDateBounds(now);
  assert.deepEqual(min, new Date(2026, 6, 1));
  assert.deepEqual(max, new Date(2026, 8, 2));
  assert.equal(isInvoiceDateAllowed(new Date(2026, 8, 2), now), true);
  assert.equal(isInvoiceDateAllowed(new Date(2026, 6, 1), now), true);
  assert.equal(isInvoiceDateAllowed(new Date(2026, 5, 30), now), false);
  assert.equal(isInvoiceDateAllowed(new Date(2026, 8, 3), now), false);
  assert.equal(isInvoiceDateAllowed(new Date('invalid'), now), false);
});

test('本期第二個月仍從上一期 1 號起', () => {
  const now = new Date(2026, 9, 15);
  assert.deepEqual(invoiceDateBounds(now).min, new Date(2026, 6, 1));
  assert.equal(isInvoiceDateAllowed(new Date(2026, 6, 1), now), true);
});

test('七、八月本期時上一期從 5 月 1 日起', () => {
  const now = new Date(2026, 7, 31);
  assert.deepEqual(invoiceDateBounds(now).min, new Date(2026, 4, 1));
  assert.equal(isInvoiceDateAllowed(new Date(2026, 4, 1), now), true);
  assert.equal(isInvoiceDateAllowed(new Date(2026, 3, 30), now), false);
});

test('ISO 日期用本地年月日，不接受不存在的日期', () => {
  assert.equal(formatIsoDate(new Date(2026, 8, 2)), '2026-09-02');
  assert.deepEqual(parseIsoDate('2026-09-02'), new Date(2026, 8, 2));
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('115-09-02'), null);
  assert.equal(formatRocDateLabel(new Date(2026, 8, 2)), '民國 115 年 9 月 2 日');
});
