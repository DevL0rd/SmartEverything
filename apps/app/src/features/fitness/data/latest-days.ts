import type { SeriesSpec } from '../model/series-spec';
import { shiftDay } from '../../../format/time';
import { useToday } from './day';
import { PRESENCE_DAYS, useDailyRows } from './queries';

export function useLastDayOf(spec: SeriesSpec, before: string): string | null {
  const today = useToday();
  const rows = useDailyRows(shiftDay(today, -PRESENCE_DAYS), today);
  const metric = spec.daily;
  if (metric === null) {
    return null;
  }
  return rows.figures.reduce<string | null>(
    (latest, figure) =>
      figure.metric === metric && figure.day < before && (latest === null || figure.day > latest)
        ? figure.day
        : latest,
    null,
  );
}
