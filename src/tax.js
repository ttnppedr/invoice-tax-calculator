/**
 * Taiwan GUI (統一發票) 5% VAT helpers.
 *
 * 財政部常見算法（本工具採用）：
 * - 應稅、未稅（銷售額為準）：營業稅 = 四捨五入(銷售額 × 5%)，總計 = 銷售額 + 營業稅
 * - 應稅、含稅（總計為準）：營業稅 = 四捨五入(總計 × 5 / 105)，銷售額 = 總計 − 營業稅
 * - 四捨五入至元：看「角」位（十分位），≥5 進位。因此 0.05 → 0、0.5 → 1。
 * - 零稅率 / 免稅：營業稅 = 0，總計 = 銷售額（兩欄互相同步）。
 *
 * 例：含稅 105 → 稅 5、銷售額 100；未稅 100 → 稅 5、總計 105。
 * 例：含稅 1 → 稅 0、銷售額 1；未稅 1 → 稅 0、總計 1。
 */

export const TAX_RATE = 0.05;
export const INCLUDED_NUMERATOR = 5;
export const INCLUDED_DENOMINATOR = 105;

/** 四捨五入至新臺幣元（非負數）。 */
export function roundTwd(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError('roundTwd expects a finite number');
  }
  return Math.round(value);
}

export function fromIncluded(total) {
  const amount = requireNonNegInt(total, 'total');
  const tax = roundTwd((amount * INCLUDED_NUMERATOR) / INCLUDED_DENOMINATOR);
  return { sales: amount - tax, tax, total: amount };
}

export function fromExcluded(sales) {
  const amount = requireNonNegInt(sales, 'sales');
  const tax = roundTwd(amount * TAX_RATE);
  return { sales: amount, tax, total: amount + tax };
}

/**
 * @param {'taxable' | 'zero' | 'exempt'} taxType
 * @param {'sales' | 'total'} source
 */
export function computeInvoice(taxType, source, value) {
  const amount = requireNonNegInt(value, source);
  if (taxType === 'zero' || taxType === 'exempt') {
    return { sales: amount, tax: 0, total: amount };
  }
  if (source === 'total') return fromIncluded(amount);
  if (source === 'sales') return fromExcluded(amount);
  throw new RangeError(`unknown source: ${source}`);
}

export function lineAmount(qty, unitPrice) {
  const q = requireNonNegInt(qty, 'qty');
  const p = requireNonNegInt(unitPrice, 'unitPrice');
  return q * p;
}

export function sumAmounts(amounts) {
  return amounts.reduce((sum, n) => sum + requireNonNegInt(n, 'amount'), 0);
}

/** Parse a TWD integer field. Empty / whitespace → null. Rejects signs and decimals. */
export function parseTwd(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/,/g, '');
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function requireNonNegInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value;
}
