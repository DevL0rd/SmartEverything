import type { HealthSourceRow } from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';

export function useActiveSources(): readonly HealthSourceRow[] {
  return useRows('health_sources').filter((source) => source.revoked_at === null);
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
