import {
  REGIONS,
  STORED_CURRENCY,
  exchangeRatesStatusOf,
  resolveRegion,
  type DeviceRegionSource,
  type ExchangeRatesRow,
  type RegionPref,
} from '@smarteverything/domain';

const MICROS_PER_DOLLAR = 1_000_000;
const UNDETECTED_LOCALE = 'en-US';

export type MoneyNotice = 'region_unknown' | 'rates_missing';

export interface MoneyFormat {
  readonly currency: string;
  readonly locale: string;
  readonly rate: number;
  readonly rateDate: string | null;
  readonly notice: MoneyNotice | null;
}

export interface MoneyInput {
  readonly pref: RegionPref;
  readonly device: DeviceRegionSource;
  readonly rates: ExchangeRatesRow | null;
  readonly now: Date;
}

const STORED_FORMAT_BASE = { currency: STORED_CURRENCY, rate: 1, rateDate: null } as const;

export function moneyFormatOf(input: MoneyInput): MoneyFormat {
  const resolution = resolveRegion(input.pref, input.device);
  if (resolution.kind === 'undetected') {
    return { ...STORED_FORMAT_BASE, locale: UNDETECTED_LOCALE, notice: 'region_unknown' };
  }
  const info = REGIONS[resolution.region];
  if (info.currency === STORED_CURRENCY) {
    return { ...STORED_FORMAT_BASE, locale: info.locale, notice: null };
  }
  const status = exchangeRatesStatusOf(input.rates, input.now);
  const rate = status.kind === 'ready' ? status.rates[info.currency] : undefined;
  if (status.kind !== 'ready' || rate === undefined) {
    return { ...STORED_FORMAT_BASE, locale: info.locale, notice: 'rates_missing' };
  }
  return {
    currency: info.currency,
    locale: info.locale,
    rate,
    rateDate: status.rateDate,
    notice: null,
  };
}

const formats = new Map<string, Intl.NumberFormat>();

function numberFormat(format: MoneyFormat, digits: number | null): Intl.NumberFormat {
  const key = `${format.locale}|${format.currency}|${String(digits)}`;
  let found = formats.get(key);
  if (found === undefined) {
    found = new Intl.NumberFormat(format.locale, {
      style: 'currency',
      currency: format.currency,
      ...(digits === null ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    });
    formats.set(key, found);
  }
  return found;
}

function minorDigitsOf(format: MoneyFormat): number {
  return numberFormat(format, null).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatDollars(format: MoneyFormat, dollars: number): string {
  const amount = dollars * format.rate;
  const minor = minorDigitsOf(format);
  if (amount === 0 || amount >= 1 / 10 ** minor) {
    return numberFormat(format, minor).format(amount);
  }
  const finer = 1 / 10 ** (minor + 1);
  if (amount >= finer) {
    return numberFormat(format, minor + 1).format(amount);
  }
  return `<${numberFormat(format, minor + 1).format(finer)}`;
}

export function formatMicros(format: MoneyFormat, micros: number): string {
  return formatDollars(format, micros / MICROS_PER_DOLLAR);
}

function localAmountOf(format: MoneyFormat, usd: number): number {
  const digits = minorDigitsOf(format);
  return Number((usd * format.rate).toFixed(digits));
}

function usdAmountOf(format: MoneyFormat, local: number): number {
  return Math.round((local / format.rate) * MICROS_PER_DOLLAR) / MICROS_PER_DOLLAR;
}

function localBoundsOf(
  format: MoneyFormat,
  usdMin: number,
  usdMax: number,
): { readonly min: number; readonly max: number } {
  const digits = minorDigitsOf(format);
  const scale = 10 ** digits;
  return {
    min: Math.ceil(usdMin * format.rate * scale) / scale,
    max: Math.floor(usdMax * format.rate * scale) / scale,
  };
}

export interface Money {
  readonly format: MoneyFormat;
  readonly toLocal: (usd: number) => number;
  readonly toUsd: (local: number) => number;
  readonly bounds: (
    usdMin: number,
    usdMax: number,
  ) => { readonly min: number; readonly max: number };
  readonly cost: (micros: number) => string;
  readonly dollars: (dollars: number) => string;
}

export function moneyOf(format: MoneyFormat): Money {
  return {
    format,
    toLocal: (usd) => localAmountOf(format, usd),
    toUsd: (local) => usdAmountOf(format, local),
    bounds: (usdMin, usdMax) => localBoundsOf(format, usdMin, usdMax),
    cost: (micros) => formatMicros(format, micros),
    dollars: (dollars) => formatDollars(format, dollars),
  };
}

const NOTICE_TEXT: Readonly<Record<MoneyNotice, string>> = {
  region_unknown:
    'This device’s region isn’t one the app can show prices for, so amounts are in US dollars. Choose a region in Settings › Region & currency.',
  rates_missing:
    'Exchange rates aren’t available yet, so amounts are in US dollars instead of your region’s currency.',
};

export function noticeText(notice: MoneyNotice): string {
  return NOTICE_TEXT[notice];
}

export function rateLine(format: MoneyFormat): string | null {
  if (format.rateDate === null) {
    return null;
  }
  return `1 ${STORED_CURRENCY} = ${new Intl.NumberFormat(format.locale, { maximumSignificantDigits: 6 }).format(format.rate)} ${format.currency} · rates of ${format.rateDate}`;
}

export function moneyNoteOf(format: MoneyFormat): string | null {
  return format.notice === null ? rateLine(format) : noticeText(format.notice);
}
