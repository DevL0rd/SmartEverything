import type { AdGuardSnapshot } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import type { SeriesReading } from '../../../store/computer-series';
import { liveSeriesId } from '../../shared/use-source-live';

export const LOOKUPS_RATE = liveSeriesId('dns_lookups_rate');
export const BLOCKED_RATE = liveSeriesId('dns_blocked_rate');

interface Totals {
  readonly at: number;
  readonly queries: number;
  readonly blocked: number;
}

export class LookupRateTracker {
  private previous: Totals | null = null;

  readings(snapshot: AdGuardSnapshot, at: number): readonly SeriesReading[] {
    const { stats } = snapshot;
    if (snapshot.connection.state !== 'online' || stats === null) {
      this.previous = null;
      return [];
    }
    const before = this.previous;
    this.previous = { at, queries: stats.queries, blocked: stats.blocked };
    const seconds = before === null ? 0 : (at - before.at) / 1000;
    if (
      before === null ||
      seconds <= 0 ||
      stats.queries < before.queries ||
      stats.blocked < before.blocked
    ) {
      return [];
    }
    return [
      [LOOKUPS_RATE, (stats.queries - before.queries) / seconds],
      [BLOCKED_RATE, (stats.blocked - before.blocked) / seconds],
    ];
  }
}

export interface LiveLookups {
  readonly allowed: readonly ChartPoint[];
  readonly blocked: readonly ChartPoint[];
}

export function splitLookups(
  lookups: readonly ChartPoint[],
  blocked: readonly ChartPoint[],
): LiveLookups {
  const blockedAt = new Map(blocked.map((point) => [point.t, point.v]));
  const shares = lookups.map((point) => Math.min(point.v, blockedAt.get(point.t) ?? 0));
  return {
    allowed: lookups.map((point, index) => ({ t: point.t, v: point.v - (shares[index] ?? 0) })),
    blocked: lookups.map((point, index) => ({ t: point.t, v: shares[index] ?? 0 })),
  };
}
