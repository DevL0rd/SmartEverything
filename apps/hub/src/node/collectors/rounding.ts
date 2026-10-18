const PERCENT_MAX = 100;
const PERCENT_STEP = 0.1;
const CELSIUS_STEP = 0.5;
const WATT_STEP = 0.1;
const GHZ_STEP = 0.01;
const RATE_DIGITS = 3;
const BYTES_SHARE = 1000;
const DECIMALS = 6;

export function toStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(DECIMALS));
}

export function significant(value: number, digits: number): number {
  return value === 0 ? 0 : Number(value.toPrecision(digits));
}

export function percent(value: number): number {
  return toStep(Math.min(PERCENT_MAX, Math.max(0, value)), PERCENT_STEP);
}

export function celsius(value: number): number {
  return toStep(value, CELSIUS_STEP);
}

export function watts(value: number): number {
  return toStep(Math.max(0, value), WATT_STEP);
}

export function ghz(value: number): number {
  return toStep(value, GHZ_STEP);
}

export function rate(value: number): number {
  return significant(Math.max(0, value), RATE_DIGITS);
}

export function bytesOf(value: number, total: number): number {
  return total <= 0 ? value : Math.round(toStep(value, total / BYTES_SHARE));
}

export function orNull(value: number | null, round: (input: number) => number): number | null {
  return value === null ? null : round(value);
}
