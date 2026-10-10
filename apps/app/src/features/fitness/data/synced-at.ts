import type { HealthMetric } from '@smarteverything/domain';
import { rowsOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { useToday } from './day';

export function useSyncedAt(metric: HealthMetric, day: string | null): string | null {
  const today = useToday();
  return useStoreSelector((state) =>
    day !== today
      ? null
      : (rowsOf(state.tables.health_daily).find((row) => row.metric === metric && row.day === day)
          ?.updated_at ?? null),
  );
}
