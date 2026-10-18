import type { WatchDayRow, WatchSampleKind } from '@smarteverything/domain';
import { max } from 'd3-array';
import { readWatchDays } from '../../api/watches';
import type { ChartPoint } from '../../components/charts';
import { watchDaysKey } from '../../queries/keys';
import { useDayKey } from '../../store/clock';
import { useScreenQuery } from '../../queries/use-screen-query';
import { compareText } from '../../format/text';

export interface WatchDay {
  readonly points: readonly ChartPoint[];
  readonly average: number | null;
  readonly maximum: number | null;
  readonly latest: number | null;
}

export type WatchDayState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'ready'; readonly stress: WatchDay; readonly vitality: WatchDay };

function dayOf(rows: readonly WatchDayRow[], kind: WatchSampleKind): WatchDay {
  const samples = rows
    .filter((row) => row.kind === kind)
    .flatMap((row) => row.samples)
    .sort((left, right) => compareText(left.time, right.time));
  const values = samples.map((sample) => sample.value);
  return {
    points: samples.map((sample) => ({ t: Date.parse(sample.time), v: sample.value })),
    average:
      values.length === 0
        ? null
        : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    maximum: max(values) ?? null,
    latest: values.at(-1) ?? null,
  };
}

export function useWatchToday(): WatchDayState {
  const today = useDayKey();
  const query = useScreenQuery({
    queryKey: watchDaysKey(today, today),
    queryFn: () => readWatchDays(today, today),
  });
  if (query.isPending) {
    return { kind: 'loading' };
  }
  if (query.isError) {
    return { kind: 'failed', error: query.error };
  }
  return {
    kind: 'ready',
    stress: dayOf(query.data, 'stress'),
    vitality: dayOf(query.data, 'vitality'),
  };
}

export function stressLevel(value: number): string {
  if (value <= 25) {
    return 'Relaxed';
  }
  if (value <= 50) {
    return 'Mild';
  }
  return value <= 80 ? 'Moderate' : 'High';
}
