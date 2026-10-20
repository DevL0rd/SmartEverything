import { minuteOfClock } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { fail } from './support';

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const DAY_MINUTES = 24 * 60;

export function isInstantText(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

export function isClockText(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && CLOCK.test(value);
}

export function instantOf(value: JsonValue | undefined, label: string): number {
  if (!isInstantText(value)) {
    return fail('TypeError', `${label} must be a moment, received ${JSON.stringify(value)}`);
  }
  return Date.parse(value);
}

export function isoOf(milliseconds: number): string {
  if (Number.isNaN(new Date(milliseconds).getTime())) {
    return fail('MathError', 'the result is outside the range of dates');
  }
  return new Date(milliseconds).toISOString();
}

export function clockOf(value: JsonValue | undefined, label: string): number {
  if (!isClockText(value)) {
    return fail('TypeError', `${label} must be a time of day, received ${JSON.stringify(value)}`);
  }
  return minuteOfClock(value);
}

export function clockText(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
