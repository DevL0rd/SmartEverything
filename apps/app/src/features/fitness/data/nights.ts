import { recordsOfType } from '../model/records';
import { nightOf, splitNights, type SleepNight } from '../model/sleep';
import { DAY_MS, HOUR_MS, startOfDayKey } from '../../../format/time';
import { useRecords } from './queries';

const EVENING_BEFORE_MS = 12 * HOUR_MS;

export interface LastNight {
  readonly night: SleepNight | null;
  readonly naps: readonly SleepNight[];
  readonly loaded: boolean;
  readonly error: Error | null;
}

export function lastNightRange(day: string): { readonly from: number; readonly to: number } {
  const start = startOfDayKey(day);
  return { from: start - EVENING_BEFORE_MS - DAY_MS, to: start + DAY_MS };
}

export function useLastNight(day: string): LastNight {
  const start = startOfDayKey(day);
  const range = lastNightRange(day);
  const records = useRecords(['SleepSession'], range.from, range.to);
  const nights = recordsOfType(records.data ?? [], 'SleepSession')
    .map(nightOf)
    .filter((night) => night.wake >= start - EVENING_BEFORE_MS && night.wake < start + DAY_MS);
  const { night, naps } = splitNights(nights, day);
  return { night, naps, loaded: records.data !== undefined, error: records.error };
}
