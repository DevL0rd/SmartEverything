import type { Store } from '../../store/store';

const HOUR_MS = 3_600_000;

const LOOKBACK_MS = 36 * HOUR_MS;

const RECENT_MS = 12 * HOUR_MS;

export function recentSleepEnd(store: Store, profileId: string, now: Date): string | null {
  const nowMs = now.getTime();
  const records = store.health.records(
    {
      types: ['SleepSession'],
      from: new Date(nowMs - LOOKBACK_MS).toISOString(),
      to: now.toISOString(),
    },
    profileId,
  );
  const ends = records
    .flatMap((record) => (record.endTime === null ? [] : [Date.parse(record.endTime)]))
    .filter((end) => end <= nowMs && nowMs - end <= RECENT_MS);
  return ends.length === 0 ? null : new Date(Math.max(...ends)).toISOString();
}
