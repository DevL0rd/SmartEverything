import type { JsonValue, ValueDescriptor } from './values';

const BOOLEAN_WORDS: Readonly<Record<string, readonly [string, string]>> = {
  lock: ['Locked', 'Unlocked'],
  contact: ['Open', 'Closed'],
  motion: ['Motion', 'Clear'],
  occupancy: ['Occupied', 'Empty'],
  leak: ['Leak', 'Dry'],
  smoke: ['Smoke', 'Clear'],
  gas: ['Gas', 'Clear'],
  vibration: ['Shaking', 'Still'],
  tank_full: ['Full', 'Not full'],
  tank_empty: ['Empty', 'Has water'],
  charging: ['Charging', 'Not charging'],
  locked: ['Locked', 'Unlocked'],
  dnd: ['On', 'Off'],
  screen_on: ['On', 'Off'],
};

export function decimalsOf(step: number): number {
  const [, fraction = ''] = String(step).split('.');
  return fraction.length;
}

function withUnit(amount: string, unit: string | null): string {
  if (unit === null) {
    return amount;
  }
  return unit === '%' || unit.startsWith('°') ? `${amount}${unit}` : `${amount} ${unit}`;
}

export const BYTE_RATE_UNIT = 'B/s';
const BYTES_UNIT = 'B';
const MEGABIT_RATE_UNIT = 'Mb/s';

interface Ladder {
  readonly below: readonly string[];
  readonly top: string;
  readonly wholeFirst: boolean;
}

const BYTES: Ladder = { below: ['B', 'kB', 'MB', 'GB'], top: 'TB', wholeFirst: true };
const MEGABITS: Ladder = { below: [MEGABIT_RATE_UNIT], top: 'Gb/s', wholeFirst: false };
const SI_STEP = 1000;
const ONE_DECIMAL_BELOW = 9.95;
const COMPACT_COUNT_FROM = 100_000;

const FORMATS = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string | undefined, digits: number): Intl.NumberFormat {
  const key = `${locale ?? ''}|${String(digits)}`;
  const known = FORMATS.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
  FORMATS.set(key, made);
  return made;
}

function digitsOf(amount: number, whole: boolean): number {
  return whole || amount >= ONE_DECIMAL_BELOW ? 0 : 1;
}

function scaled(value: number, ladder: Ladder, locale: string | undefined): string {
  let amount = value;
  for (const [index, unit] of ladder.below.entries()) {
    const digits = digitsOf(amount, ladder.wholeFirst && index === 0);
    if (Number(amount.toFixed(digits)) < SI_STEP) {
      return `${numberFormat(locale, digits).format(amount)} ${unit}`;
    }
    amount /= SI_STEP;
  }
  return `${numberFormat(locale, digitsOf(amount, false)).format(amount)} ${ladder.top}`;
}

export function formatBytes(bytes: number, locale?: string): string {
  return scaled(bytes, BYTES, locale);
}

export function formatByteRate(bytesPerSecond: number, locale?: string): string {
  return `${formatBytes(bytesPerSecond, locale)}/s`;
}

export function formatMegabits(megabitsPerSecond: number, locale?: string): string {
  return scaled(megabitsPerSecond, MEGABITS, locale);
}

export interface CountFormat {
  readonly compact?: boolean;
  readonly locale?: string;
}

export function formatCount(value: number, format: CountFormat = {}): string {
  const grouped = (amount: number): string => new Intl.NumberFormat(format.locale).format(amount);
  return format.compact === true && value >= COMPACT_COUNT_FROM
    ? `${grouped(Math.round(value / SI_STEP))}k`
    : grouped(Math.round(value));
}

const UNIT_FORMATS: ReadonlyMap<string, (value: number, locale: string | undefined) => string> =
  new Map([
    [BYTE_RATE_UNIT, formatByteRate],
    [BYTES_UNIT, formatBytes],
    [MEGABIT_RATE_UNIT, formatMegabits],
  ]);

export function formatNumber(
  value: number,
  unit: string | null,
  step: number,
  locale?: string,
): string {
  const format = unit === null ? undefined : UNIT_FORMATS.get(unit);
  return format === undefined
    ? withUnit(numberFormat(locale, decimalsOf(step)).format(value), unit)
    : format(value, locale);
}

export function formatValue(
  key: string,
  descriptor: ValueDescriptor,
  value: JsonValue,
  locale?: string,
): string {
  if (descriptor.kind === 'number' && typeof value === 'number') {
    return formatNumber(value, descriptor.unit ?? null, descriptor.step, locale);
  }
  if (typeof value === 'boolean') {
    const words = BOOLEAN_WORDS[key] ?? ['On', 'Off'];
    return value ? words[0] : words[1];
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
