import type { DesktopDriveCache } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { plural } from '../../../format/text';
import { gigabytesOf, gigabytesProblemOf } from './gigabytes';

const DURATION = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/;

const UNIT_SECONDS: Readonly<Record<string, number>> = {
  '': 60,
  s: 1,
  sec: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hour: 3600,
  hours: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
};

const NAMED_UNITS = [
  { seconds: 86_400, name: 'day' },
  { seconds: 3600, name: 'hour' },
  { seconds: 60, name: 'minute' },
] as const;

export const DURATION_HELPER = 'A number of minutes, or add s, m, h or d, like 90s, 30m, 2h or 1d.';

export const DURATION_PROBLEM = 'Use a time like 30m, 2h or 1d';

export const SIZE_PROBLEM = 'Use a size above 0 GB, such as 50 or 1.5';

export const OFF = 'Off';

class CacheEntryError extends Error {
  override readonly name = 'CacheEntryError';
}

export function durationSecondsOf(text: string): number | null {
  const match = DURATION.exec(text.trim().toLowerCase());
  if (match === null) return null;
  const [, amount = '', unit = ''] = match;
  const scale = UNIT_SECONDS[unit];
  if (scale === undefined) return null;
  const seconds = Math.round(Number(amount) * scale);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

export function durationProblemOf(text: string): string | null {
  return durationSecondsOf(text) === null ? DURATION_PROBLEM : null;
}

export function requiredDurationOf(text: string): number {
  const seconds = durationSecondsOf(text);
  if (seconds === null) throw new CacheEntryError(`${text} is not a length of time.`);
  return seconds;
}

type NamedUnit = (typeof NAMED_UNITS)[number];

function wholeUnitOf(seconds: number): NamedUnit | undefined {
  return NAMED_UNITS.find((one) => seconds >= one.seconds && seconds % one.seconds === 0);
}

export function durationText(seconds: number): string {
  const unit = wholeUnitOf(seconds);
  return unit === undefined ? plural(seconds, 'second') : plural(seconds / unit.seconds, unit.name);
}

export function durationInitialOf(seconds: number): string {
  const unit = wholeUnitOf(seconds);
  return unit === undefined
    ? `${String(seconds)}s`
    : `${String(seconds / unit.seconds)}${unit.name.charAt(0)}`;
}

export function cacheSizeProblemOf(text: string): string | null {
  if (gigabytesProblemOf(text) !== null) return SIZE_PROBLEM;
  const value = gigabytesOf(text);
  return value === null || value > 0 ? null : SIZE_PROBLEM;
}

export function optionalSizeText(value: number | null): string {
  return value === null ? OFF : bytes(value);
}

export type CacheField = keyof DesktopDriveCache;

export function cacheWith(
  cache: DesktopDriveCache,
  field: CacheField,
  text: string,
): DesktopDriveCache {
  switch (field) {
    case 'maxAgeSeconds':
      return { ...cache, maxAgeSeconds: requiredDurationOf(text) };
    case 'cleanupSeconds':
      return { ...cache, cleanupSeconds: requiredDurationOf(text) };
    case 'maxBytes':
      return { ...cache, maxBytes: gigabytesOf(text) };
    case 'minFreeBytes':
      return { ...cache, minFreeBytes: gigabytesOf(text) };
  }
}
