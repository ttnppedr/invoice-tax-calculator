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

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 以日曆月加減，該日不存在時落到該月最後一天（3/31 − 1 月 → 2/28）。 */
export function addCalendarMonths(date, months) {
  if (!Number.isInteger(months)) {
    throw new TypeError('months must be an integer');
  }
  const year = date.getFullYear();
  const monthIndex = date.getMonth() + months;
  const day = date.getDate();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay));
}

/**
 * 發票日期可選區間：上一期 1 號起至今天。
 * 本期雙月窗起始往前兩個月的 1 號，例如 9/2 或 10/15 皆從 7/1 起。
 */
export function invoiceDateBounds(now = new Date()) {
  const max = startOfLocalDay(now);
  const periodStartMonth = bimonthlyStart(max.getMonth() + 1);
  const currentPeriodStart = new Date(max.getFullYear(), periodStartMonth - 1, 1);
  return { min: addCalendarMonths(currentPeriodStart, -2), max };
}

export function isInvoiceDateAllowed(date, now = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const day = startOfLocalDay(date);
  const { min, max } = invoiceDateBounds(now);
  return day.getTime() >= min.getTime() && day.getTime() <= max.getTime();
}

export function formatIsoDate(date) {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function datePartsFrom(date) {
  return {
    rocYear: toRocYear(date),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function gregorianFromRocParts({ rocYear, month, day }) {
  return new Date(rocYear + 1911, month - 1, day);
}

export function formatRocDateLabel(date) {
  const { rocYear, month, day } = datePartsFrom(date);
  return `民國 ${rocYear} 年 ${month} 月 ${day} 日`;
}
