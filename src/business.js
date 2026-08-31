/**
 * 營利事業統一編號檢核與財政部稅籍公開 API 查詢。
 *
 * 檢查碼採 2023 年啟用之新版邏輯：權重 1,2,1,2,1,2,4,1，
 * 乘積各位數相加後總和須可被 5 整除；第七位為 7 時，該位可取 0 或 1。
 */

export const BUSINESS_LOOKUP_URL = 'https://eip.fia.gov.tw/OAI/api/businessRegistration';
export const LOOKUP_TIMEOUT_MS = 8000;
export const WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/** 只去掉前後空白；其他非數字不改寫。不符合 8 位數字 → null。 */
export function normalizeBusinessNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!/^\d{8}$/.test(text)) return null;
  return text;
}

function digitFold(n) {
  return Math.floor(n / 10) + (n % 10);
}

function checksumTotals(digits) {
  const parts = digits.map((digit, i) => digitFold(digit * WEIGHTS[i]));
  if (digits[6] !== 7) {
    return [parts.reduce((sum, n) => sum + n, 0)];
  }
  const withoutSeventh = parts.reduce((sum, n, i) => (i === 6 ? sum : sum + n), 0);
  return [withoutSeventh + 0, withoutSeventh + 1];
}

export function isValidBusinessNumber(raw) {
  const taxId = normalizeBusinessNumber(raw);
  if (!taxId || taxId === '00000000') return false;
  const digits = [...taxId].map(Number);
  return checksumTotals(digits).some((total) => total % 5 === 0);
}

/**
 * @returns {Promise<
 *   | { ok: true, taxId: string, name: string }
 *   | { ok: false, reason: 'invalid-format' | 'invalid-checksum' | 'not-found' | 'timeout' | 'aborted' | 'error' }
 * >}
 */
export async function lookupBusinessByNumber(
  taxId,
  { signal, fetchImpl = fetch, getTimedOut = () => false } = {},
) {
  const normalized = normalizeBusinessNumber(taxId);
  if (!normalized) return { ok: false, reason: 'invalid-format' };
  if (!isValidBusinessNumber(normalized)) return { ok: false, reason: 'invalid-checksum' };

  let response;
  try {
    response = await fetchImpl(`${BUSINESS_LOOKUP_URL}/${normalized}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, reason: getTimedOut() ? 'timeout' : 'aborted' };
    }
    return { ok: false, reason: 'error' };
  }

  if (response.status === 404) return { ok: false, reason: 'not-found' };
  if (!response.ok) return { ok: false, reason: 'error' };

  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: 'error' };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'not-found' };
  }
  if (!data.ban && !data.businessNm) return { ok: false, reason: 'not-found' };
  if (data.ban !== normalized) return { ok: false, reason: 'error' };
  if (typeof data.businessNm !== 'string' || data.businessNm.trim() === '') {
    return { ok: false, reason: 'error' };
  }

  return { ok: true, taxId: normalized, name: data.businessNm.trim() };
}
