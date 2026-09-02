import { normalizeBusinessNumber } from './business.js';

export const LOOKUP_HISTORY_KEY = 'invoice-lookup-history';
export const LOOKUP_HISTORY_LIMIT = 8;
export const LOOKUP_HISTORY_NAME_MAX = 80;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const taxId = normalizeBusinessNumber(raw.taxId);
  if (!taxId) return null;
  const name = String(raw.name ?? '').trim().slice(0, LOOKUP_HISTORY_NAME_MAX);
  if (!name) return null;
  return { taxId, name };
}

function readList(storage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(LOOKUP_HISTORY_KEY) ?? '');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const items = [];
    for (const raw of parsed) {
      const entry = normalizeEntry(raw);
      if (!entry || seen.has(entry.taxId)) continue;
      seen.add(entry.taxId);
      items.push(entry);
      if (items.length === LOOKUP_HISTORY_LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

function writeList(storage, items) {
  if (!storage) return items;
  try {
    storage.setItem(LOOKUP_HISTORY_KEY, JSON.stringify(items));
  } catch {
    // 私人模式或額度不足時略過，畫面仍用記憶體清單。
  }
  return items;
}

export function loadLookupHistory(storage = defaultStorage()) {
  return readList(storage);
}

export function rememberLookup(entry, storage = defaultStorage()) {
  const next = normalizeEntry(entry);
  if (!next) return readList(storage);
  return writeList(storage, [next, ...readList(storage).filter((item) => item.taxId !== next.taxId)].slice(0, LOOKUP_HISTORY_LIMIT));
}

export function clearLookupHistory(storage = defaultStorage()) {
  if (storage) {
    try {
      storage.removeItem(LOOKUP_HISTORY_KEY);
    } catch {
      // ignore
    }
  }
  return [];
}
