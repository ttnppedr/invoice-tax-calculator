/**
 * 新臺幣金額國字大寫（壹貳參肆伍陸柒捌玖、拾佰仟萬億、元整）。
 * 供手寫統一發票「總計新臺幣」欄抄寫。
 */

const DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
const SMALL_UNITS = ['', '拾', '佰', '仟'];

/** 0–9999 → 國字（不含萬／億）。 */
function sectionToChinese(n) {
  if (n === 0) return '';
  const padded = String(n).padStart(4, '0');
  let out = '';
  let pendingZero = false;
  for (let i = 0; i < 4; i += 1) {
    const digit = Number(padded[i]);
    const unit = SMALL_UNITS[3 - i];
    if (digit === 0) {
      pendingZero = out.length > 0;
      continue;
    }
    if (pendingZero) out += '零';
    out += DIGITS[digit] + unit;
    pendingZero = false;
  }
  return out;
}

/**
 * 完整大寫，例如 105 →「壹佰零伍元整」。
 * 支援至仟億（12 位數）。負數不接受。
 */
export function toChineseCapital(amount) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new TypeError('amount must be a non-negative integer');
  }
  if (amount === 0) return '零元整';

  const yi = Math.floor(amount / 100_000_000);
  const wan = Math.floor((amount % 100_000_000) / 10_000);
  const rest = amount % 10_000;

  let out = '';
  if (yi) out += sectionToChinese(yi) + '億';
  if (wan) {
    if (yi && wan < 1000) out += '零';
    out += sectionToChinese(wan) + '萬';
  }
  if (rest) {
    if (yi && !wan) out += '零';
    else if ((yi || wan) && rest < 1000) out += '零';
    out += sectionToChinese(rest);
  }
  return `${out}元整`;
}

export const CAPITAL_PLACES = [
  { key: 'yi', label: '億', weight: 100_000_000 },
  { key: 'qianWan', label: '仟', weight: 10_000_000 },
  { key: 'baiWan', label: '佰', weight: 1_000_000 },
  { key: 'shiWan', label: '拾', weight: 100_000 },
  { key: 'wan', label: '萬', weight: 10_000 },
  { key: 'qian', label: '仟', weight: 1_000 },
  { key: 'bai', label: '佰', weight: 100 },
  { key: 'shi', label: '拾', weight: 10 },
  { key: 'yuan', label: '元', weight: 1 },
];

/**
 * 發票格子用：由高到低 9 格（億…元）。
 * 前導空位維持空白（不填零），中間與尾數的 0 填「零」。
 */
export function toCapitalPlaces(amount) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new TypeError('amount must be a non-negative integer');
  }
  if (amount === 0) {
    return CAPITAL_PLACES.map((place, i) => ({
      ...place,
      glyph: i === CAPITAL_PLACES.length - 1 ? '零' : '',
    }));
  }
  const width = CAPITAL_PLACES.length;
  const digits = String(amount).padStart(width, '0').slice(-width);
  let started = false;
  return CAPITAL_PLACES.map((place, i) => {
    const n = Number(digits[i]);
    if (!started && n === 0) return { ...place, glyph: '' };
    started = true;
    return { ...place, glyph: DIGITS[n] };
  });
}
