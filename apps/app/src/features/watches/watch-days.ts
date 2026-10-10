import { useQuery } from '@tanstack/react-query';
import type { WatchDayRow, WatchSampleKind } from '@smarteverything/domain';
import { readWatchDays } from '../../api/watches';
import type { ChartPoint } from '../../components/charts';
import { dayKeyOf } from '../../format/time';
import { watchDaysKey } from '../../queries/keys';
import { useMinute } from '../../store/clock';

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
    .sort((left, right) => left.time.localeCompare(right.time));
  const values = samples.map((sample) => sample.value);
  return {
    points: samples.map((sample) => ({ t: Date.parse(sample.time), v: sample.value })),
    average:
      values.length === 0
        ? null
        : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    maximum: values.length === 0 ? null : Math.max(...values),
    latest: values.at(-1) ?? null,
  };
}

export function useWatchToday(): WatchDayState {
  const today = dayKeyOf(useMinute());
  const query = useQuery({
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
