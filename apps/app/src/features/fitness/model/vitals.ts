import { trendOf, type Trend } from './aggregate';
import { baselineOf, latestFigure, seriesFor } from './daily';
import type { DailyFigure } from './points';
import type { SeriesSpec } from './series-spec';
import { dayLabel, shiftDay, startOfDayKey } from '../../../format/time';

export interface VitalReading {
  readonly value: number | null;
  readonly spark: readonly number[];
  readonly trend: Trend | null;
  readonly when: string;
}

export function vitalOf(
  spec: SeriesSpec,
  figures: readonly DailyFigure[],
  day: string,
  sparkDays: number,
): VitalReading {
  const latest = latestFigure(figures, spec.key, day);
  const days = Array.from({ length: sparkDays }, (_, index) =>
    shiftDay(day, index - sparkDays + 1),
  );
  const spark = seriesFor(figures, spec.key, days).filter(
    (value): value is number => value !== null,
  );
  if (latest === null) {
    return { value: null, spark, trend: null, when: 'not synced yet' };
  }
  return {
    value: latest.value,
    spark,
    trend: trendOf(latest.value, baselineOf(figures, latest.day, spec.key), spec.better),
    when: latest.day === day ? 'today' : dayLabel(startOfDayKey(latest.day), startOfDayKey(day)),
  };
}
