import type { HealthSourceRow } from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';

export function useSources(): readonly HealthSourceRow[] {
  return useRows('health_sources');
}

export function latestSyncOf(sources: readonly HealthSourceRow[]): string | null {
  return sources.reduce<string | null>(
    (latest, source) =>
      source.last_sync_at !== null && (latest === null || source.last_sync_at > latest)
        ? source.last_sync_at
        : latest,
    null,
  );
}
