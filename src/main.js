import { lookupBusinessByNumber, LOOKUP_TIMEOUT_MS } from './business.js';
import { CAPITAL_PLACES, toCapitalPlaces, toChineseCapital } from './chinese.js';
import {
  closeLookup,
  createInvoiceState,
  insertLookupResult,
  openLookup,
  resetInvoiceState,
  setAmountFrom,
  setBuyer,
  setDate,
  setLookupQuery,
  setLookupStatus,
  setPeriod,
  setTaxType,
} from './invoice-state.js';
import { formatPeriod, periodOptions } from './period.js';
import { parseTwd } from './tax.js';
import './style.css';

const HINTS = {
  idle: '先填「總計」＝含稅；先填「銷售額合計」＝未稅。',
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
  error: '目前無法連線官方查詢服務，請改為手動填寫名稱與統編。',
};

const els = {
  hint: document.querySelector('#source-hint'),
  invoice: document.querySelector('#invoice'),
  periodDisplay: document.querySelector('#period-display'),
  rocYear: document.querySelector('#roc-year'),
  periodMonths: document.querySelector('#period-months'),
  buyerName: document.querySelector('#buyer-name'),
  buyerTaxId: document.querySelector('#buyer-tax-id'),
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
  capitalPhrase: document.querySelector('#capital-phrase'),
  btnLookup: document.querySelector('#btn-lookup'),
  btnLookupIcon: document.querySelector('#btn-lookup-icon'),
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
let lookupTrigger = els.btnLookup;

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
}

function renderPeriod() {
  els.periodDisplay.textContent = formatPeriod(state.period.rocYear, state.period.startMonth);
  if (document.activeElement !== els.rocYear) {
    els.rocYear.value = String(state.period.rocYear);
  }
  els.periodMonths.value = String(state.period.startMonth);
}

function renderDate() {
  if (document.activeElement !== els.dateYear) els.dateYear.value = String(state.date.rocYear);
  if (document.activeElement !== els.dateMonth) els.dateMonth.value = String(state.date.month);
  if (document.activeElement !== els.dateDay) els.dateDay.value = String(state.date.day);
}

function renderBuyer() {
  if (document.activeElement !== els.buyerName) els.buyerName.value = state.buyer.name;
  if (document.activeElement !== els.buyerTaxId) els.buyerTaxId.value = state.buyer.taxId;
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
  if (state.amountError === 'overflow') {
    els.hint.textContent = HINTS.overflow;
    return;
  }
  els.hint.textContent = HINTS[state.amountSource];
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
  for (const btn of els.taxMarks) {
    const on = btn.dataset.tax === state.taxType;
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '✓' : '';
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
      li.append(label, glyph);
      return li;
    }),
  );
  els.capitalPhrase.textContent = amount === null ? '' : toChineseCapital(amount);
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

function buildPeriodOptions() {
  els.periodMonths.replaceChildren(
    ...periodOptions().map((opt) => {
      const option = document.createElement('option');
      option.value = String(opt.start);
      option.textContent = opt.label;
      return option;
    }),
  );
}

function init() {
  buildPeriodOptions();
  render();

  els.rocYear.addEventListener('input', () => {
    const rocYear = parseTwd(digitsOnly(els.rocYear.value, 3));
    if (rocYear === null) return;
    setState(setPeriod(state, { rocYear }));
  });
  els.periodMonths.addEventListener('change', () => {
    setState(setPeriod(state, { startMonth: Number(els.periodMonths.value) }));
  });

  els.dateYear.addEventListener('input', () => {
    const rocYear = parseTwd(digitsOnly(els.dateYear.value, 3));
    if (rocYear === null) return;
    setState(setDate(state, { rocYear }));
  });
  els.dateMonth.addEventListener('input', () => {
    const month = parseTwd(digitsOnly(els.dateMonth.value, 2));
    if (month === null || month < 1 || month > 12) return;
    setState(setDate(state, { month }));
  });
  els.dateDay.addEventListener('input', () => {
    const day = parseTwd(digitsOnly(els.dateDay.value, 2));
    if (day === null || day < 1 || day > 31) return;
    setState(setDate(state, { day }));
  });

  els.buyerName.addEventListener('input', () => {
    setState(setBuyer(state, { name: els.buyerName.value }));
  });
  els.buyerTaxId.addEventListener('input', () => {
    setState(setBuyer(state, { taxId: digitsOnly(els.buyerTaxId.value, 8) }));
  });

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

  els.btnLookup.addEventListener('click', () => openLookupDialog(els.btnLookup));
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
