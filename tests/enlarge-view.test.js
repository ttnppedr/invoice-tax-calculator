import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clientRectToLocal,
  computeStretchScale,
  computeUniformScale,
  isKeyboardResize,
  planEnlargeLayout,
} from '../src/enlarge-view.js';

test('可用空間或紙張尺寸無效時維持 1 倍', () => {
  assert.equal(computeUniformScale({ availWidth: 0, availHeight: 400, contentWidth: 804, contentHeight: 574 }), 1);
  assert.equal(computeUniformScale({ availWidth: 800, availHeight: 400, contentWidth: 0, contentHeight: 574 }), 1);
});

test('高度先到頂時用高度決定等比例', () => {
  assert.equal(
    computeUniformScale({ availWidth: 1200, availHeight: 287, contentWidth: 804, contentHeight: 574 }),
    0.5,
  );
});

test('寬度先到頂時用寬度決定等比例', () => {
  assert.equal(
    computeUniformScale({ availWidth: 402, availHeight: 800, contentWidth: 804, contentHeight: 574 }),
    0.5,
  );
});

test('橫向大螢幕允許放大超過 1 倍', () => {
  assert.equal(
    computeUniformScale({ availWidth: 1608, availHeight: 1148, contentWidth: 804, contentHeight: 574 }),
    2,
  );
});

test('未進入對照時維持 1 倍', () => {
  assert.deepEqual(
    planEnlargeLayout({
      active: false,
      orientation: 'landscape',
      availWidth: 390,
      availHeight: 700,
      contentWidth: 804,
      contentHeight: 574,
    }),
    { scaleX: 1, scaleY: 1 },
  );
});

test('對照模式寬高各自拉滿可用空間', () => {
  assert.deepEqual(
    computeStretchScale({ availWidth: 390, availHeight: 700, contentWidth: 804, contentHeight: 574 }),
    { scaleX: 390 / 804, scaleY: 700 / 574 },
  );
  assert.deepEqual(
    planEnlargeLayout({
      active: true,
      availWidth: 844,
      availHeight: 390,
      contentWidth: 804,
      contentHeight: 574,
    }),
    { scaleX: 844 / 804, scaleY: 390 / 574 },
  );
});

test('輸入時鍵盤彈出則沿用上次寬高比例', () => {
  assert.deepEqual(
    planEnlargeLayout({
      active: true,
      keyboardOpen: true,
      previousScaleX: 1.1,
      previousScaleY: 0.8,
      availWidth: 400,
      availHeight: 120,
      contentWidth: 804,
      contentHeight: 574,
    }),
    { scaleX: 1.1, scaleY: 0.8 },
  );
});

test('未縮放時 client 座標與版面座標一致', () => {
  const wrap = { left: 10, top: 20, width: 100, height: 50 };
  const cell = { left: 30, top: 25, right: 80, bottom: 45, width: 50, height: 20 };
  assert.deepEqual(clientRectToLocal(cell, wrap, { width: 100, height: 50 }), {
    left: 20,
    top: 5,
    right: 70,
    bottom: 25,
    width: 50,
    height: 20,
  });
});

test('縮放 0.5 時把視覺座標除回版面空間', () => {
  const wrap = { left: 0, top: 0, width: 400, height: 200 };
  const cell = { left: 100, top: 20, right: 200, bottom: 60, width: 100, height: 40 };
  assert.deepEqual(clientRectToLocal(cell, wrap, { width: 800, height: 400 }), {
    left: 200,
    top: 40,
    right: 400,
    bottom: 120,
    width: 200,
    height: 80,
  });
});

test('鍵盤判定：未聚焦或高度幾乎沒變都不是鍵盤', () => {
  assert.equal(isKeyboardResize({ inputFocused: false, viewportHeight: 400, layoutHeight: 800 }), false);
  assert.equal(isKeyboardResize({ inputFocused: true, viewportHeight: 780, layoutHeight: 800 }), false);
});

test('鍵盤判定：聚焦且可視高度明顯變矮', () => {
  assert.equal(isKeyboardResize({ inputFocused: true, viewportHeight: 400, layoutHeight: 800 }), true);
});
