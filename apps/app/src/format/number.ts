import { numberFormat } from './locale';

const NO_BREAK_SPACE = '\u00A0';

const DECIMALS = new Map<number, Intl.NumberFormat>();

function decimalFormat(digits: number): Intl.NumberFormat {
  const known = DECIMALS.get(digits);
  if (known !== undefined) return known;
  const made = numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits });
  DECIMALS.set(digits, made);
  return made;
}

export function decimal(value: number, digits = 0): string {
  return decimalFormat(digits).format(value);
}

export function rounded(value: number, digits: number): string {
  return numberFormat({ maximumFractionDigits: digits }).format(value);
}

export function compact(value: number): string {
  return numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function percent(share: number, digits = 0): string {
  return `${decimal(share * 100, digits)}${NO_BREAK_SPACE}%`;
}

export function count(value: number): string {
  return numberFormat().format(Math.round(value));
}

export function withUnit(value: string, unit: string | null | undefined): string {
  if (unit === null || unit === undefined || unit === '') {
    return value;
  }
  return unit === '%' || unit === '°' ? `${value}${unit}` : `${value}${NO_BREAK_SPACE}${unit}`;
}

export function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function signed(value: number, digits = 0): string {
  const written = decimal(Math.abs(value), digits);
  if (Number(Math.abs(value).toFixed(digits)) === 0) {
    return '±0';
  }
  return `${value > 0 ? '+' : '−'}${written}`;
}

export function litres(millilitres: number): string {
  return withUnit(decimal(millilitres / 1000, millilitres % 100 === 0 ? 1 : 2), 'L');
}

export function millilitres(value: number): string {
  return withUnit(count(value), 'ml');
}

export function kilometres(metres: number, digits = 2): string {
  return withUnit(decimal(metres / 1000, digits), 'km');
}

export function kilocalories(value: number): string {
  return withUnit(count(value), 'kcal');
}

export function kilograms(value: number, digits = 1): string {
  return withUnit(decimal(value, digits), 'kg');
}

export function milliseconds(value: number): string {
  return withUnit(decimal(value), 'ms');
}

export function times(factor: number): string {
  return `${decimal(factor, 1)}×`;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function bytes(value: number): string {
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${decimal(size, unit === 0 || size >= 10 ? 0 : 1)}${NO_BREAK_SPACE}${BYTE_UNITS[unit] ?? 'GB'}`;
}
