import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isValidBusinessNumber,
  lookupBusinessByNumber,
  normalizeBusinessNumber,
} from '../src/business.js';

test('normalizeBusinessNumber 只接受恰好 8 位數字', () => {
  assert.equal(normalizeBusinessNumber('20828393'), '20828393');
  assert.equal(normalizeBusinessNumber(' 04595252 '), '04595252');
  assert.equal(normalizeBusinessNumber('2082 8393'), null);
  assert.equal(normalizeBusinessNumber('2082839'), null);
  assert.equal(normalizeBusinessNumber('208283930'), null);
  assert.equal(normalizeBusinessNumber('2082839a'), null);
  assert.equal(normalizeBusinessNumber('2082839.3'), null);
  assert.equal(normalizeBusinessNumber('-20828393'), null);
});

test('新版檢查碼：官方範例與既有統編', () => {
  assert.equal(isValidBusinessNumber('04595252'), true);
  assert.equal(isValidBusinessNumber('10458570'), true);
  assert.equal(isValidBusinessNumber('20828393'), true);
});

test('全零與格式錯誤必須拒絕', () => {
  assert.equal(isValidBusinessNumber('00000000'), false);
  assert.equal(isValidBusinessNumber('12345678'), false);
  assert.equal(isValidBusinessNumber(''), false);
});

test('lookup 在格式或檢查碼失敗時不呼叫 fetch', async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    throw new Error('should not fetch');
  };
  assert.deepEqual(await lookupBusinessByNumber('00000000', { fetchImpl }), {
    ok: false,
    reason: 'invalid-checksum',
  });
  assert.deepEqual(await lookupBusinessByNumber('abc', { fetchImpl }), {
    ok: false,
    reason: 'invalid-format',
  });
  assert.equal(called, 0);
});

test('lookup 成功只回傳統編與名稱', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ban: '20828393',
      businessNm: '宏碁股份有限公司',
      businessAddress: 'should-not-leak',
    }),
  });
  assert.deepEqual(await lookupBusinessByNumber('20828393', { fetchImpl }), {
    ok: true,
    taxId: '20828393',
    name: '宏碁股份有限公司',
  });
});

test('lookup 查無資料與服務錯誤', async () => {
  const notFound = async () => ({ ok: false, status: 404, json: async () => ({}) });
  assert.deepEqual(await lookupBusinessByNumber('04595252', { fetchImpl: notFound }), {
    ok: false,
    reason: 'not-found',
  });

  const badJson = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('bad json');
    },
  });
  assert.deepEqual(await lookupBusinessByNumber('04595252', { fetchImpl: badJson }), {
    ok: false,
    reason: 'error',
  });

  const mismatch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ban: '11111111', businessNm: '錯' }),
  });
  assert.deepEqual(await lookupBusinessByNumber('04595252', { fetchImpl: mismatch }), {
    ok: false,
    reason: 'error',
  });
});

test('lookup 逾時回傳 timeout', async () => {
  const fetchImpl = async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  };
  assert.deepEqual(
    await lookupBusinessByNumber('20828393', { fetchImpl, getTimedOut: () => true }),
    { ok: false, reason: 'timeout' },
  );
});
