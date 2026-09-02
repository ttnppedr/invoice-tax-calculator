import { MAX_CAPITAL_AMOUNT } from './chinese.js';
import { currentPeriod, toRocYear } from './period.js';
import { computeInvoice } from './tax.js';

const EMPTY_INVOICE = { sales: null, tax: null, total: null };

function emptyLookup() {
  return {
    open: false,
    query: '',
    status: 'idle',
    result: null,
    message: '',
  };
}

function deriveAmounts(amountSource, sourceValue, taxType) {
  if (amountSource === 'idle' || sourceValue === null) {
    return { invoice: { ...EMPTY_INVOICE }, amountError: null };
  }
  if (sourceValue > MAX_CAPITAL_AMOUNT) {
    return { invoice: { ...EMPTY_INVOICE }, amountError: 'overflow' };
  }
  return {
    invoice: computeInvoice(taxType, amountSource, sourceValue),
    amountError: null,
  };
}

export function createInvoiceState(now = new Date()) {
  const period = currentPeriod(now);
  return {
    amountSource: 'idle',
    sourceValue: null,
    taxType: 'taxable',
    invoice: { ...EMPTY_INVOICE },
    amountError: null,
    period: {
      rocYear: period.rocYear,
      startMonth: period.startMonth,
    },
    date: {
      rocYear: toRocYear(now),
      month: now.getMonth() + 1,
      day: now.getDate(),
    },
    buyer: {
      taxId: '',
      name: '',
    },
    lookup: emptyLookup(),
  };
}

export function setAmountFrom(state, source, value) {
  if (value === null) {
    return {
      ...state,
      amountSource: 'idle',
      sourceValue: null,
      invoice: { ...EMPTY_INVOICE },
      amountError: null,
    };
  }
  const derived = deriveAmounts(source, value, state.taxType);
  return {
    ...state,
    amountSource: source,
    sourceValue: value,
    invoice: derived.invoice,
    amountError: derived.amountError,
  };
}

export function setTaxType(state, taxType) {
  const derived = deriveAmounts(state.amountSource, state.sourceValue, taxType);
  return {
    ...state,
    taxType,
    invoice: derived.invoice,
    amountError: derived.amountError,
  };
}

export function setPeriod(state, patch) {
  return { ...state, period: { ...state.period, ...patch } };
}

export function setDate(state, patch) {
  return { ...state, date: { ...state.date, ...patch } };
}

export function setBuyer(state, patch) {
  return { ...state, buyer: { ...state.buyer, ...patch } };
}

export function openLookup(state) {
  return {
    ...state,
    lookup: {
      ...state.lookup,
      open: true,
      query: state.lookup.query || state.buyer.taxId,
      status: state.lookup.result ? state.lookup.status : 'idle',
      message: state.lookup.result ? state.lookup.message : '',
    },
  };
}

export function closeLookup(state) {
  return { ...state, lookup: { ...state.lookup, open: false } };
}

export function setLookupQuery(state, query) {
  return { ...state, lookup: { ...state.lookup, query } };
}

export function setLookupStatus(state, status, { result = null, message = '' } = {}) {
  return {
    ...state,
    lookup: { ...state.lookup, status, result, message },
  };
}

export function selectLookupResult(state, result) {
  if (!result?.taxId || !result?.name) return state;
  return {
    ...state,
    lookup: {
      ...state.lookup,
      open: true,
      query: result.taxId,
      status: 'success',
      result: { taxId: result.taxId, name: result.name },
      message: '',
    },
  };
}

export function insertLookupResult(state) {
  const result = state.lookup.result;
  if (!result) return closeLookup(state);
  return {
    ...state,
    buyer: { taxId: result.taxId, name: result.name },
    lookup: { ...emptyLookup() },
  };
}

export function resetInvoiceState(now = new Date()) {
  return createInvoiceState(now);
}
