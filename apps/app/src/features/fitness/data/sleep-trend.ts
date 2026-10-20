import type { HealthRecord } from '@smarteverything/domain';
import { recordsOfType } from '../model/records';
import { nightOf, type SleepNight } from '../model/sleep';
import { monthRowsOf, trendOf, type MonthRow, type SleepTrend } from '../model/sleep-trend';
import { elapsedPart, previousWindow, type Window } from '../model/window';
import { HOUR_MS } from '../../../format/time';
import { useRecords } from './queries';

const EVENING_BEFORE_MS = 12 * HOUR_MS;

export interface SleepTrendView {
  readonly window: Window;
  readonly trend: SleepTrend;
  readonly months: readonly MonthRow[] | null;
  readonly loaded: boolean;
  readonly error: Error | null;
}

function nightsIn(data: readonly HealthRecord[] | undefined): readonly SleepNight[] {
  return recordsOfType(data ?? [], 'SleepSession').map(nightOf);
}

export function useSleepTrend(window: Window, today: string): SleepTrendView {
  const previous = previousWindow(window);
  const current = useRecords(['SleepSession'], window.start - EVENING_BEFORE_MS, window.end);
  const before = useRecords(['SleepSession'], previous.start - EVENING_BEFORE_MS, previous.end);
  const nights = nightsIn(current.data);
  const elapsed = elapsedPart(window, today);
  return {
    window,
    trend: trendOf(nights, nightsIn(before.data), elapsed),
    months: window.range === 'year' ? monthRowsOf(nights, elapsed) : null,
    loaded: current.data !== undefined,
    error: current.error,
  };
}
