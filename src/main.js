import { CAPITAL_PLACES, toCapitalPlaces, toChineseCapital } from './chinese.js';
import { currentPeriod, formatPeriod, periodOptions } from './period.js';
import { computeInvoice, lineAmount, parseTwd } from './tax.js';
import './style.css';

const LINE_COUNT = 8;

const els = {
  rocYear: document.querySelector('#roc-year'),
  periodMonths: document.querySelector('#period-months'),
  periodDisplay: document.querySelector('#period-display'),
  buyerPanel: document.querySelector('#buyer-panel'),
  buyerTaxId: document.querySelector('#buyer-tax-id'),
  buyerError: document.querySelector('#buyer-error'),
  btnBuyer: document.querySelector('#btn-buyer'),
  btnClear: document.querySelector('#btn-clear'),
  btnPrint: document.querySelector('#btn-print'),
  taxChecks: [...document.querySelectorAll('input[name="tax-type"]')],
  rows: document.querySelector('#item-rows'),
  sales: document.querySelector('#sales'),
  tax: document.querySelector('#tax'),
  total: document.querySelector('#total'),
  capitalBoxes: document.querySelector('#capital-boxes'),
  capitalPhrase: document.querySelector('#capital-phrase'),
  slip: document.querySelector('#slip'),
  hint: document.querySelector('#source-hint'),
};

/** @type {'idle' | 'sales' | 'total' | 'lines'} */
let source = 'idle';

function defaultPeriod() {
  return currentPeriod();
}

function selectedTaxType() {
  const checked = els.taxChecks.find((box) => box.checked);
  return checked?.value ?? 'taxable';
}

function setTaxType(value) {
  for (const box of els.taxChecks) {
    box.checked = box.value === value;
  }
}

function readLines() {
  return [...els.rows.querySelectorAll('tr')].map((row) => ({
    name: row.querySelector('[data-field="name"]').value,
    qty: parseTwd(row.querySelector('[data-field="qty"]').value),
    unit: parseTwd(row.querySelector('[data-field="unit"]').value),
    amountRaw: parseTwd(row.querySelector('[data-field="amount"]').value),
    note: row.querySelector('[data-field="note"]').value,
    amountCell: row.querySelector('[data-field="amount"]'),
  }));
}

function linesHaveNumbers(lines) {
  return lines.some((line) => line.qty !== null || line.unit !== null || line.amountRaw !== null);
}

function resolveLineAmount(line) {
  if (line.qty !== null && line.unit !== null) return lineAmount(line.qty, line.unit);
  return line.amountRaw;
}

function sumLineAmounts(lines) {
  return lines.reduce((sum, line) => {
    const amount = resolveLineAmount(line);
    return amount === null ? sum : sum + amount;
  }, 0);
}

function refreshComputedAmounts(lines) {
  for (const line of lines) {
    const computed = line.qty !== null && line.unit !== null;
    line.amountCell.readOnly = computed;
    if (computed) line.amountCell.value = String(lineAmount(line.qty, line.unit));
  }
}

function renderPeriod() {
  const year = parseTwd(els.rocYear.value) ?? defaultPeriod().rocYear;
  const start = Number(els.periodMonths.value);
  els.periodDisplay.textContent = formatPeriod(year, start);
}

function renderCapital(amount) {
  const places = amount === null ? CAPITAL_PLACES.map((p) => ({ ...p, glyph: '' })) : toCapitalPlaces(amount);
  els.capitalBoxes.replaceChildren(
    ...places.map((place) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="place">${place.label}</span><span class="glyph">${place.glyph}</span>`;
      return li;
    }),
  );
  els.capitalPhrase.textContent = amount === null ? '' : toChineseCapital(amount);
}

function setMoneyFields({ sales, tax, total }, { fillSales = true, fillTotal = true } = {}) {
  if (fillSales) els.sales.value = sales === null ? '' : String(sales);
  if (fillTotal) els.total.value = total === null ? '' : String(total);
  els.tax.textContent = tax === null ? '—' : String(tax);
  renderCapital(total);
}

function hintFor(mode) {
  if (mode === 'lines') return '明細列有數字：銷售額合計＝各列金額加總，再依稅別算出營業稅與總計。';
  if (mode === 'total') return '以「總計」為準（含稅）：營業稅＝四捨五入(總計 × 5 ÷ 105)。';
  if (mode === 'sales') return '以「銷售額合計」為準（未稅）：營業稅＝四捨五入(銷售額 × 5%)。';
  return '先填「總計」＝含稅；先填「銷售額合計」＝未稅。明細有數字時，銷售額改由金額加總。';
}

function recalc() {
  const lines = readLines();
  refreshComputedAmounts(lines);
  const fromLines = linesHaveNumbers(lines);
  if (!fromLines && source === 'lines') {
    source = parseTwd(els.sales.value) !== null ? 'sales' : 'idle';
  }
  els.slip.classList.toggle('lines-active', fromLines);
  els.sales.readOnly = fromLines;

  const mode = fromLines ? 'lines' : source;
  els.hint.textContent = hintFor(mode);

  if (mode === 'idle') {
    setMoneyFields({ sales: null, tax: null, total: null });
    return;
  }

  const taxType = selectedTaxType();
  if (mode === 'lines') {
    const sales = sumLineAmounts(lines);
    const result = computeInvoice(taxType, 'sales', sales);
    setMoneyFields(result);
    return;
  }

  if (mode === 'sales') {
    const sales = parseTwd(els.sales.value);
    if (sales === null) {
      setMoneyFields({ sales: null, tax: null, total: null }, { fillSales: false });
      return;
    }
    setMoneyFields(computeInvoice(taxType, 'sales', sales), { fillSales: false });
    return;
  }

  const total = parseTwd(els.total.value);
  if (total === null) {
    setMoneyFields({ sales: null, tax: null, total: null }, { fillTotal: false });
    return;
  }
  setMoneyFields(computeInvoice(taxType, 'total', total), { fillTotal: false });
}

function buildRows() {
  els.rows.replaceChildren(
    ...Array.from({ length: LINE_COUNT }, () => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-name"><input data-field="name" type="text" autocomplete="off" /></td>
        <td class="col-qty"><input data-field="qty" type="text" inputmode="numeric" autocomplete="off" /></td>
        <td class="col-unit"><input data-field="unit" type="text" inputmode="numeric" autocomplete="off" /></td>
        <td class="col-amt"><input data-field="amount" type="text" inputmode="numeric" autocomplete="off" /></td>
        <td class="col-note"><input data-field="note" type="text" autocomplete="off" /></td>
      `;
      return tr;
    }),
  );
}

function buildPeriodOptions() {
  const { rocYear, startMonth } = defaultPeriod();
  els.periodMonths.replaceChildren(
    ...periodOptions().map((opt) => {
      const option = document.createElement('option');
      option.value = String(opt.start);
      option.textContent = opt.label;
      return option;
    }),
  );
  els.rocYear.value = String(rocYear);
  els.periodMonths.value = String(startMonth);
  renderPeriod();
}

function validateBuyer() {
  const raw = els.buyerTaxId.value.trim();
  const ok = raw === '' || /^\d{8}$/.test(raw);
  els.buyerError.hidden = ok;
  els.buyerTaxId.setAttribute('aria-invalid', ok ? 'false' : 'true');
}

function clearForm() {
  source = 'idle';
  setTaxType('taxable');
  els.buyerTaxId.value = '';
  els.buyerError.hidden = true;
  els.buyerPanel.hidden = true;
  els.btnBuyer.setAttribute('aria-expanded', 'false');
  for (const input of els.rows.querySelectorAll('input')) input.value = '';
  els.sales.readOnly = false;
  setMoneyFields({ sales: null, tax: null, total: null });
  buildPeriodOptions();
  els.hint.textContent = hintFor('idle');
  els.slip.classList.remove('lines-active');
}

function onlyDigits(event) {
  const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (allowed.includes(event.key) || event.ctrlKey || event.metaKey) return;
  if (!/^\d$/.test(event.key)) event.preventDefault();
}

function init() {
  buildRows();
  buildPeriodOptions();
  renderCapital(null);

  els.rocYear.addEventListener('input', () => {
    els.rocYear.value = els.rocYear.value.replace(/\D/g, '').slice(0, 3);
    renderPeriod();
  });
  els.periodMonths.addEventListener('change', renderPeriod);

  els.btnBuyer.addEventListener('click', () => {
    const open = els.buyerPanel.hidden;
    els.buyerPanel.hidden = !open;
    els.btnBuyer.setAttribute('aria-expanded', String(open));
    if (open) els.buyerTaxId.focus();
  });
  els.buyerTaxId.addEventListener('input', () => {
    els.buyerTaxId.value = els.buyerTaxId.value.replace(/\D/g, '').slice(0, 8);
    validateBuyer();
  });

  els.btnClear.addEventListener('click', clearForm);
  els.btnPrint.addEventListener('click', () => window.print());

  for (const box of els.taxChecks) {
    box.addEventListener('change', () => {
      if (box.checked) setTaxType(box.value);
      else if (!els.taxChecks.some((other) => other.checked)) setTaxType(box.value);
      recalc();
    });
  }

  els.rows.addEventListener('input', (event) => {
    const field = event.target.dataset?.field;
    if (field === 'qty' || field === 'unit' || field === 'amount') {
      event.target.value = event.target.value.replace(/\D/g, '');
    }
    if (field === 'qty' || field === 'unit' || field === 'amount') source = 'lines';
    recalc();
  });

  els.sales.addEventListener('keydown', onlyDigits);
  els.total.addEventListener('keydown', onlyDigits);
  els.sales.addEventListener('input', () => {
    if (els.sales.readOnly) return;
    els.sales.value = els.sales.value.replace(/\D/g, '');
    source = 'sales';
    recalc();
  });
  els.total.addEventListener('input', () => {
    els.total.value = els.total.value.replace(/\D/g, '');
    source = 'total';
    recalc();
  });
}

init();
