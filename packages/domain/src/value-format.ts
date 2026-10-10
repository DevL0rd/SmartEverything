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

export function withUnit(amount: string, unit: string | null): string {
  if (unit === null) {
    return amount;
  }
  return unit === '%' || unit.startsWith('°') ? `${amount}${unit}` : `${amount} ${unit}`;
}

export const BYTE_RATE_UNIT = 'B/s';

const BYTE_RATE_STEPS: readonly (readonly [number, string])[] = [
  [1e9, 'GB/s'],
  [1e6, 'MB/s'],
  [1e3, 'kB/s'],
];

export function formatByteRate(bytesPerSecond: number): string {
  const step = BYTE_RATE_STEPS.find(([size]) => bytesPerSecond >= size);
  if (step === undefined) {
    return `${String(Math.round(bytesPerSecond))} B/s`;
  }
  const amount = bytesPerSecond / step[0];
  return `${amount.toFixed(amount < 10 ? 1 : 0)} ${step[1]}`;
}

function formatNumber(value: number, unit: string | null, step: number): string {
  if (unit === BYTE_RATE_UNIT) {
    return formatByteRate(value);
  }
  return withUnit(value.toFixed(decimalsOf(step)), unit);
}

export function formatValue(key: string, descriptor: ValueDescriptor, value: JsonValue): string {
  if (descriptor.kind === 'number' && typeof value === 'number') {
    return formatNumber(value, descriptor.unit ?? null, descriptor.step);
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
