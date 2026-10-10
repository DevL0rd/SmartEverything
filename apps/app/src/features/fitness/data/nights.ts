import { recordsOfType } from '../model/records';
import { nightOf, type SleepNight } from '../model/sleep';
import { DAY_MS, HOUR_MS, startOfDayKey } from '../../../format/time';
import { useRecords } from './queries';

const EVENING_BEFORE_MS = 12 * HOUR_MS;

export interface LastNight {
  readonly night: SleepNight | null;
  readonly loaded: boolean;
  readonly error: Error | null;
}

export function useLastNight(day: string): LastNight {
  const start = startOfDayKey(day);
  const records = useRecords(['SleepSession'], start - EVENING_BEFORE_MS - DAY_MS, start + DAY_MS);
  const nights = recordsOfType(records.data ?? [], 'SleepSession')
    .map(nightOf)
    .filter((night) => night.wake >= start - EVENING_BEFORE_MS && night.wake < start + DAY_MS)
    .sort((left, right) => right.asleepMinutes - left.asleepMinutes);
  return { night: nights[0] ?? null, loaded: records.data !== undefined, error: records.error };
}
