import { lookupBusinessByNumber, LOOKUP_TIMEOUT_MS } from './business.js';
import { CAPITAL_PLACES, toCapitalPlaces } from './chinese.js';
import {
  closeLookup,
  createInvoiceState,
  insertLookupResult,
  openLookup,
  resetInvoiceState,
  setAmountFrom,
  setLookupQuery,
  setLookupStatus,
  setTaxType,
} from './invoice-state.js';
import { clientRectToLocal, createEnlargeView } from './enlarge-view.js';
import { formatPeriod } from './period.js';
import { parseTwd } from './tax.js';
import './enlarge.css';
import './style.css';

const HINTS = {
  sales: '以「銷售額合計」為準（未稅）：營業稅＝四捨五入(銷售額 × 5%)。',
  total: '以「總計」為準（含稅）：營業稅＝四捨五入(總計 × 5 ÷ 105)。',
  overflow: '金額超過中文大寫可顯示範圍（至億元）。',
};

const LOOKUP_MESSAGES = {
  idle: '請輸入 8 位統一編號。',
  loading: '查詢中…',
  'invalid-format': '統一編號須為 8 位數字。',
  'invalid-checksum': '統一編號檢查碼不正確，請重新確認。',
  'not-found': '財政部公開資料查無此統一編號。',
  timeout: '查詢逾時，請再試一次。',
  error: '目前無法連線官方查詢服務，請稍後再試。',
};

const els = {
  hint: document.querySelector('#source-hint'),
  invoice: document.querySelector('#invoice'),
  periodDisplay: document.querySelector('#period-display'),
  buyerName: document.querySelector('#buyer-name'),
  taxIdBoxes: document.querySelector('#tax-id-boxes'),
  dateYear: document.querySelector('#date-year'),
  dateMonth: document.querySelector('#date-month'),
  dateDay: document.querySelector('#date-day'),
  lineAmount: document.querySelector('#line-amount'),
  salesInput: document.querySelector('#sales-input'),
  salesOutput: document.querySelector('#sales-output'),
  totalInput: document.querySelector('#total-input'),
  totalOutput: document.querySelector('#total-output'),
  taxOutput: document.querySelector('#tax-output'),
  taxMarks: [...document.querySelectorAll('.tax-mark')],
  capitalBoxes: document.querySelector('#capital-boxes'),
  gridWrap: document.querySelector('.invoice-grid-wrap'),
  voidSvg: document.querySelector('.void-stroke'),
  btnLookupIcon: document.querySelector('#btn-lookup-icon'),
  btnEnlarge: document.querySelector('#btn-enlarge'),
  btnEnlargeClose: document.querySelector('#btn-enlarge-close'),
  btnClear: document.querySelector('#btn-clear'),
  dialog: document.querySelector('#lookup-dialog'),
  lookupForm: document.querySelector('#lookup-form'),
  lookupQuery: document.querySelector('#lookup-query'),
  lookupStatus: document.querySelector('#lookup-status'),
  lookupResult: document.querySelector('#lookup-result'),
  lookupResultTaxId: document.querySelector('#lookup-result-tax-id'),
  lookupResultName: document.querySelector('#lookup-result-name'),
  btnLookupClose: document.querySelector('#btn-lookup-close'),
  btnLookupInsert: document.querySelector('#btn-lookup-insert'),
};

let state = createInvoiceState();
const lookupCache = new Map();
let lookupController = null;
let lookupRequestId = 0;
let lookupTrigger = els.btnLookupIcon;
let enlargeView = null;

function moneyText(value) {
  return value === null ? '' : String(value);
}

function setState(next) {
  state = next;
  render();
}

function render() {
  renderPeriod();
  renderDate();
  renderBuyer();
  renderAmountSource();
  renderInvoiceAmounts();
  renderTaxType();
  renderCapitalAmount();
  renderLookupDialog();
  if (enlargeView) {
    enlargeView.relayout();
  } else {
    requestAnimationFrame(alignVoidStroke);
  }
}

function setLine(el, x1, y1, x2, y2) {
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
}

function alignVoidStroke() {
  const svg = els.voidSvg;
  const wrap = els.gridWrap;
  if (!svg || !wrap) return;
  const main = svg.querySelector('.void-stroke__main');
  const ticks = [...svg.querySelectorAll('.void-stroke__tick')];
  const cells = [...document.querySelectorAll('.void-row')].map((row) => row.cells[3]).filter(Boolean);
  if (!main || ticks.length < 2 || cells.length === 0) return;
  const wrapRect = wrap.getBoundingClientRect();
  const layout = { width: wrap.offsetWidth, height: wrap.offsetHeight };
  const first = clientRectToLocal(cells[0].getBoundingClientRect(), wrapRect, layout);
  const last = clientRectToLocal(cells[cells.length - 1].getBoundingClientRect(), wrapRect, layout);
  const x1 = first.right - 3;
  const y1 = first.top + 3;
  const x2 = last.left + 3;
  const y2 = last.bottom - 3;
  setLine(main, x1, y1, x2, y2);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const tx = dx / len;
  const ty = dy / len;
  const px = -ty;
  const py = tx;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const halfTick = 6;
  const halfGap = 3.2;
  ticks.forEach((tick, i) => {
    const side = i === 0 ? -1 : 1;
    const cx = midX + tx * halfGap * side;
    const cy = midY + ty * halfGap * side;
    setLine(tick, cx - px * halfTick, cy - py * halfTick, cx + px * halfTick, cy + py * halfTick);
  });
}

function renderPeriod() {
  els.periodDisplay.textContent = formatPeriod(state.period.rocYear, state.period.startMonth);
}

function renderDate() {
  els.dateYear.textContent = String(state.date.rocYear);
  els.dateMonth.textContent = String(state.date.month);
  els.dateDay.textContent = String(state.date.day);
}

function renderBuyer() {
  els.buyerName.value = state.buyer.name;
  els.invoice.classList.toggle('has-buyer', Boolean(state.buyer.taxId));
  const digits = state.buyer.taxId.padEnd(8).slice(0, 8);
  els.taxIdBoxes.replaceChildren(
    ...[...digits].map((ch) => {
      const li = document.createElement('li');
      li.textContent = /\d/.test(ch) ? ch : '';
      return li;
    }),
  );
}

function renderAmountSource() {
  const fromSales = state.amountSource === 'sales';
  const fromTotal = state.amountSource === 'total';
  els.salesInput.hidden = fromTotal;
  els.salesOutput.hidden = !fromTotal;
  els.totalInput.hidden = fromSales;
  els.totalOutput.hidden = !fromSales;
  els.salesInput.disabled = fromTotal;
  els.totalInput.disabled = fromSales;
  let hint = '';
  if (state.amountError === 'overflow') {
    hint = HINTS.overflow;
  } else if (HINTS[state.amountSource]) {
    hint = HINTS[state.amountSource];
  }
  els.hint.textContent = hint;
  els.hint.hidden = !hint;
}

function renderInvoiceAmounts() {
  const { sales, tax, total } = state.invoice;
  const hasAmount = sales !== null || total !== null;
  els.invoice.classList.toggle('has-amount', hasAmount);
  els.lineAmount.textContent = moneyText(sales);
  if (document.activeElement !== els.salesInput) {
    els.salesInput.value = state.amountSource === 'sales' ? moneyText(state.sourceValue) : '';
  }
  els.salesOutput.textContent = moneyText(sales);
  if (document.activeElement !== els.totalInput) {
    els.totalInput.value = state.amountSource === 'total' ? moneyText(state.sourceValue) : '';
  }
  els.totalOutput.textContent = moneyText(total);
  els.taxOutput.textContent = moneyText(tax);
}

function renderTaxType() {
  const hasAmount = state.invoice.sales !== null || state.invoice.total !== null;
  for (const btn of els.taxMarks) {
    const on = btn.dataset.tax === state.taxType;
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = hasAmount && on ? '✓' : '';
  }
}

function renderCapitalAmount() {
  const amount = state.amountError || state.invoice.total === null ? null : state.invoice.total;
  const places = amount === null ? CAPITAL_PLACES.map((p) => ({ ...p, glyph: '' })) : toCapitalPlaces(amount);
  els.capitalBoxes.replaceChildren(
    ...places.map((place) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'place';
      label.textContent = place.label;
      const glyph = document.createElement('span');
      glyph.className = 'glyph';
      glyph.textContent = place.glyph;
      if (place.glyph) li.className = 'has-value';
      else if (amount !== null) li.className = 'is-void';
      li.append(glyph, label);
      return li;
    }),
  );
}

function renderLookupDialog() {
  if (state.lookup.open && !els.dialog.open) {
    els.dialog.showModal();
    els.lookupQuery.focus();
  }
  if (!state.lookup.open && els.dialog.open) {
    els.dialog.close();
  }
  if (document.activeElement !== els.lookupQuery) {
    els.lookupQuery.value = state.lookup.query;
  }
  const success = state.lookup.status === 'success' && state.lookup.result;
  els.lookupResult.hidden = !success;
  if (success) {
    els.lookupResultTaxId.textContent = state.lookup.result.taxId;
    els.lookupResultName.textContent = state.lookup.result.name;
  } else {
    els.lookupResultTaxId.textContent = '';
    els.lookupResultName.textContent = '';
  }
  if (state.lookup.message) {
    els.lookupStatus.textContent = state.lookup.message;
  } else if (state.lookup.status === 'idle') {
    els.lookupStatus.textContent = LOOKUP_MESSAGES.idle;
  } else {
    els.lookupStatus.textContent = LOOKUP_MESSAGES[state.lookup.status] ?? '';
  }
}

function digitsOnly(raw, max) {
  return raw.replace(/\D/g, '').slice(0, max);
}

function applyAmountInput(source, raw) {
  const parsed = parseTwd(digitsOnly(raw, 15));
  setState(setAmountFrom(state, source, parsed));
}

function cancelLookup() {
  lookupController?.abort();
  lookupController = null;
}

function startLookup() {
  const query = state.lookup.query;
  const cached = lookupCache.get(query);
  if (cached) {
    setState(setLookupStatus(state, 'success', { result: cached, message: '' }));
    return;
  }

  cancelLookup();
  const requestId = ++lookupRequestId;
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, LOOKUP_TIMEOUT_MS);
  lookupController = controller;
  setState(setLookupStatus(state, 'loading', { message: LOOKUP_MESSAGES.loading }));

  lookupBusinessByNumber(query, {
    signal: controller.signal,
    getTimedOut: () => timedOut,
  })
    .then((result) => {
      if (requestId !== lookupRequestId) return;
      if (result.ok) {
        lookupCache.set(result.taxId, { taxId: result.taxId, name: result.name });
        setState(setLookupStatus(state, 'success', { result, message: '' }));
        return;
      }
      if (result.reason === 'aborted') return;
      setState(
        setLookupStatus(state, result.reason, {
          message: LOOKUP_MESSAGES[result.reason] ?? LOOKUP_MESSAGES.error,
        }),
      );
    })
    .finally(() => {
      window.clearTimeout(timer);
      if (lookupController === controller) lookupController = null;
    });
}

function openLookupDialog(trigger) {
  lookupTrigger = trigger;
  setState(openLookup(state));
}

function closeLookupDialog() {
  cancelLookup();
  setState(closeLookup(state));
  lookupTrigger?.focus();
}

function init() {
  enlargeView = createEnlargeView({
    root: document.documentElement,
    invoice: els.invoice,
    stage: document.querySelector('.invoice-scroll'),
    scaleHost: document.querySelector('#invoice-scale'),
    toggleButton: els.btnEnlarge,
    closeButton: els.btnEnlargeClose,
    isBlockingOverlayOpen: () => els.dialog.open,
    onLayoutChange: () => requestAnimationFrame(alignVoidStroke),
    isInputFocused: () => document.activeElement === els.salesInput || document.activeElement === els.totalInput,
  });
  enlargeView.init();
  render();

  els.salesInput.addEventListener('input', () => {
    els.salesInput.value = digitsOnly(els.salesInput.value, 15);
    applyAmountInput('sales', els.salesInput.value);
  });
  els.totalInput.addEventListener('input', () => {
    els.totalInput.value = digitsOnly(els.totalInput.value, 15);
    applyAmountInput('total', els.totalInput.value);
  });

  for (const btn of els.taxMarks) {
    btn.addEventListener('click', () => {
      setState(setTaxType(state, btn.dataset.tax));
    });
  }

  els.btnClear.addEventListener('click', () => {
    cancelLookup();
    setState(resetInvoiceState());
    els.salesInput.focus();
  });

  els.btnLookupIcon.addEventListener('click', () => openLookupDialog(els.btnLookupIcon));
  els.btnLookupClose.addEventListener('click', closeLookupDialog);

  els.dialog.addEventListener('close', () => {
    if (state.lookup.open) {
      cancelLookup();
      state = closeLookup(state);
      lookupTrigger?.focus();
    }
  });

  els.lookupQuery.addEventListener('input', () => {
    setState(setLookupQuery(state, digitsOnly(els.lookupQuery.value, 8)));
  });

  els.lookupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    startLookup();
  });

  els.btnLookupInsert.addEventListener('click', () => {
    setState(insertLookupResult(state));
    lookupTrigger?.focus();
  });
}

init();
