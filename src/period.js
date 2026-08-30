/**
 * 統一發票期別：民國年 + 雙月窗（1–2、3–4、…、11–12）。
 */

const MONTH_WORDS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const YEAR_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const BIMONTHLY_STARTS = [1, 3, 5, 7, 9, 11];

export function toRocYear(date = new Date()) {
  return date.getFullYear() - 1911;
}

/** 單月 → 該期起始奇數月。 */
export function bimonthlyStart(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('month must be 1–12');
  }
  return month % 2 === 0 ? month - 1 : month;
}

export function currentPeriod(date = new Date()) {
  return {
    rocYear: toRocYear(date),
    startMonth: bimonthlyStart(date.getMonth() + 1),
  };
}

export function yearToChineseDigits(rocYear) {
  if (!Number.isInteger(rocYear) || rocYear < 0) {
    throw new TypeError('rocYear must be a non-negative integer');
  }
  return String(rocYear)
    .split('')
    .map((d) => YEAR_DIGITS[Number(d)])
    .join('');
}

export function formatPeriod(rocYear, startMonth) {
  const start = bimonthlyStart(startMonth);
  const end = start + 1;
  return `${yearToChineseDigits(rocYear)}年${MONTH_WORDS[start]}、${MONTH_WORDS[end]}月份`;
}

export function periodOptions() {
  return BIMONTHLY_STARTS.map((start) => ({
    start,
    label: `${MONTH_WORDS[start]}、${MONTH_WORDS[start + 1]}月`,
  }));
}
