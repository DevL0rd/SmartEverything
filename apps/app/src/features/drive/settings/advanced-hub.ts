import {
  DEFAULT_FILE_IO_THREADS,
  DEFAULT_LISTING_CACHE_SECONDS,
  MAX_FILE_IO_THREADS,
  type DriveSettings,
} from '@smarteverything/domain';
import { count } from '../../../format/number';
import { plural } from '../../../format/text';
import { ENTRY_PROBLEM, TuningEntryError, secondsOf, secondsText, wholeOf } from './advanced-model';

export type HubTuningField = 'fileIoThreads' | 'cpuWorkers' | 'listingCacheSeconds';

const HUB_FIELDS: readonly HubTuningField[] = [
  'fileIoThreads',
  'cpuWorkers',
  'listingCacheSeconds',
];

export type HubTuning = Pick<DriveSettings, HubTuningField>;

export const HUB_DEFAULTS: Readonly<Record<HubTuningField, number | null>> = {
  fileIoThreads: DEFAULT_FILE_IO_THREADS,
  cpuWorkers: null,
  listingCacheSeconds: DEFAULT_LISTING_CACHE_SECONDS,
};

export function hubIsDefault(settings: HubTuning, field: HubTuningField): boolean {
  const standard = HUB_DEFAULTS[field];
  return standard === null || settings[field] === standard;
}

export function hubResetAll(settings: HubTuning): Partial<HubTuning> {
  const reset: Partial<Record<HubTuningField, number>> = {};
  for (const field of HUB_FIELDS) {
    const value = HUB_DEFAULTS[field];
    if (value !== null && settings[field] !== value) reset[field] = value;
  }
  return reset;
}

export function hubProblemOf(field: HubTuningField, text: string): string | null {
  if (field === 'listingCacheSeconds') {
    return secondsOf(text) === null ? ENTRY_PROBLEM.seconds : null;
  }
  const value = wholeOf(text);
  if (value === null || value < 1) return 'Use a whole number, 1 or more';
  if (field === 'fileIoThreads' && value > MAX_FILE_IO_THREADS) {
    return `Node allows up to ${count(MAX_FILE_IO_THREADS)} file threads`;
  }
  return null;
}

export function hubEntryOf(field: HubTuningField, text: string): number {
  const value = field === 'listingCacheSeconds' ? secondsOf(text) : wholeOf(text);
  if (value === null) throw new TuningEntryError(`${text} is not a valid value.`);
  return value;
}

export function hubValueText(field: HubTuningField, value: number): string {
  if (field === 'listingCacheSeconds') return secondsText(value, 'Off');
  return field === 'fileIoThreads' ? plural(value, 'thread') : plural(value, 'worker');
}
