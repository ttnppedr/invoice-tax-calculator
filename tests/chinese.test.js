import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCapitalInRange, MAX_CAPITAL_AMOUNT, toCapitalPlaces, toChineseCapital } from '../src/chinese.js';

test('常見發票金額', () => {
  assert.equal(toChineseCapital(0), '零元整');
  assert.equal(toChineseCapital(1), '壹元整');
  assert.equal(toChineseCapital(10), '壹拾元整');
  assert.equal(toChineseCapital(11), '壹拾壹元整');
  assert.equal(toChineseCapital(20), '貳拾元整');
  assert.equal(toChineseCapital(100), '壹佰元整');
  assert.equal(toChineseCapital(105), '壹佰零伍元整');
});

test('仟、萬、億與中間零', () => {
  assert.equal(toChineseCapital(1000), '壹仟元整');
  assert.equal(toChineseCapital(1010), '壹仟零壹拾元整');
  assert.equal(toChineseCapital(10000), '壹萬元整');
  assert.equal(toChineseCapital(10001), '壹萬零壹元整');
  assert.equal(toChineseCapital(10100), '壹萬零壹佰元整');
  assert.equal(toChineseCapital(11000), '壹萬壹仟元整');
  assert.equal(toChineseCapital(100000), '壹拾萬元整');
  assert.equal(toChineseCapital(100000000), '壹億元整');
  assert.equal(toChineseCapital(100000001), '壹億零壹元整');
  assert.equal(toChineseCapital(100001000), '壹億零壹仟元整');
  assert.equal(toChineseCapital(100100000), '壹億零壹拾萬元整');
});

test('格子：105 填入佰拾元', () => {
  const glyphs = toCapitalPlaces(105).map((p) => p.glyph);
  assert.deepEqual(glyphs, ['', '', '', '', '', '', '壹', '零', '伍']);
});

test('格子：0 只在元位寫零', () => {
  const glyphs = toCapitalPlaces(0).map((p) => p.glyph);
  assert.deepEqual(glyphs, ['', '', '', '', '', '', '', '', '零']);
});

test('位值欄上限為 9 位數', () => {
  assert.equal(isCapitalInRange(MAX_CAPITAL_AMOUNT), true);
  assert.equal(isCapitalInRange(MAX_CAPITAL_AMOUNT + 1), false);
  const glyphs = toCapitalPlaces(MAX_CAPITAL_AMOUNT).map((p) => p.glyph);
  assert.deepEqual(glyphs, ['玖', '玖', '玖', '玖', '玖', '玖', '玖', '玖', '玖']);
});
