import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bimonthlyStart,
  currentPeriod,
  formatPeriod,
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
