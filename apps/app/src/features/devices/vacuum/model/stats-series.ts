import type { VacuumCleanSummary, VacuumValues } from '@smarteverything/domain';
import { DAY_MS } from '../../../../format/time';
import { bucketIndexOf, weekStartOf, type StatsPeriod } from './stats-period';

export type StatsClean = Pick<
  VacuumCleanSummary,
  'startedAt' | 'seconds' | 'areaM2' | 'scope' | 'mode' | 'rooms' | 'outcome'
>;

export interface StatsBucket {
  readonly startMs: number;
  readonly cleans: number;
  readonly areaM2: number;
  readonly seconds: number;
}

export interface StatsTotals {
  readonly cleans: number;
  readonly areaM2: number;
  readonly seconds: number;
  readonly averageSeconds: number | null;
  readonly averageAreaM2: number | null;
}

export interface StatsSummary {
  readonly buckets: readonly StatsBucket[];
  readonly totals: StatsTotals;
  readonly peakAreaIndex: number | null;
  readonly peakSecondsIndex: number | null;
  readonly empty: boolean;
}

const MOP_MODES: readonly string[] = ['sweep_mop', 'sweep_then_mop'];
const WHOLE_HOME_SCOPE = 'global';

function startOf(clean: StatsClean): number {
  return Date.parse(clean.startedAt);
}

function inPeriod(cleans: readonly StatsClean[], period: StatsPeriod): readonly StatsClean[] {
  return cleans.filter((clean) => bucketIndexOf(period, startOf(clean)) !== null);
}

function peakIndex(values: readonly number[]): number | null {
  let best = -1;
  let top = 0;
  for (const [index, value] of values.entries()) {
    if (value > top) {
      best = index;
      top = value;
    }
  }
  return best < 0 ? null : best;
}

export function statsOf(cleans: readonly StatsClean[], period: StatsPeriod): StatsSummary {
  const buckets = period.bucketStarts.map((startMs) => ({
    startMs,
    cleans: 0,
    areaM2: 0,
    seconds: 0,
  }));
  for (const clean of inPeriod(cleans, period)) {
    const index = bucketIndexOf(period, startOf(clean));
    const bucket = index === null ? undefined : buckets[index];
    if (bucket !== undefined) {
      bucket.cleans += 1;
      bucket.areaM2 += clean.areaM2;
      bucket.seconds += clean.seconds;
    }
  }
  const count = buckets.reduce((sum, bucket) => sum + bucket.cleans, 0);
  const areaM2 = buckets.reduce((sum, bucket) => sum + bucket.areaM2, 0);
  const seconds = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  return {
    buckets,
    totals: {
      cleans: count,
      areaM2,
      seconds,
      averageSeconds: count === 0 ? null : seconds / count,
      averageAreaM2: count === 0 ? null : areaM2 / count,
    },
    peakAreaIndex: peakIndex(buckets.map((bucket) => bucket.areaM2)),
    peakSecondsIndex: peakIndex(buckets.map((bucket) => bucket.seconds)),
    empty: count === 0,
  };
}

export interface WeeklyBucket {
  readonly startMs: number;
  readonly vacuumCleans: number;
  readonly mopCleans: number;
  readonly errors: number;
}

function weekStarts(period: StatsPeriod): readonly number[] {
  const starts: number[] = [];
  let at = weekStartOf(period.startMs);
  while (at < period.endMs) {
    starts.push(at);
    at = weekStartOf(at + 7 * DAY_MS + DAY_MS / 2);
  }
  return starts;
}

export function weeklyOf(
  cleans: readonly StatsClean[],
  period: StatsPeriod,
): readonly WeeklyBucket[] {
  const weeks = weekStarts(period).map((startMs) => ({
    startMs,
    vacuumCleans: 0,
    mopCleans: 0,
    errors: 0,
  }));
  for (const clean of inPeriod(cleans, period)) {
    const week = weeks.find((candidate) => candidate.startMs === weekStartOf(startOf(clean)));
    if (week === undefined) {
      continue;
    }
    if (clean.mode === 'sweep') {
      week.vacuumCleans += 1;
    } else if (clean.mode !== null && MOP_MODES.includes(clean.mode)) {
      week.mopCleans += 1;
    }
    if (clean.outcome === 'error') {
      week.errors += 1;
    }
  }
  return weeks;
}

export interface StatsRoom {
  readonly id: number;
  readonly name: string;
}

export interface RoomHistoryRow {
  readonly id: number;
  readonly name: string;
  readonly cells: readonly number[];
  readonly lastCleanedMs: number | null;
  readonly daysSince: number | null;
}

function touches(clean: StatsClean, room: StatsRoom): boolean {
  return clean.rooms.length === 0
    ? clean.scope === WHOLE_HOME_SCOPE
    : clean.rooms.some((cleaned) => cleaned.id === room.id);
}

export function roomHistoryOf(
  cleans: readonly StatsClean[],
  rooms: readonly StatsRoom[],
  period: StatsPeriod,
  nowMs: number,
): readonly RoomHistoryRow[] {
  return rooms.map((room) => {
    const mine = cleans.filter((clean) => touches(clean, room));
    const cells = period.bucketStarts.map(() => 0);
    for (const clean of mine) {
      const index = bucketIndexOf(period, startOf(clean));
      if (index !== null) {
        cells[index] = (cells[index] ?? 0) + 1;
      }
    }
    const lastCleanedMs = mine.reduce<number | null>(
      (latest, clean) => Math.max(latest ?? 0, startOf(clean)),
      null,
    );
    return {
      id: room.id,
      name: room.name,
      cells,
      lastCleanedMs,
      daysSince:
        lastCleanedMs === null ? null : Math.max(0, Math.floor((nowMs - lastCleanedMs) / DAY_MS)),
    };
  });
}

export interface LifetimeTotals {
  readonly cleans: number | null;
  readonly minutes: number | null;
}

function countOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function lifetimeOf(values: VacuumValues): LifetimeTotals {
  return {
    cleans: countOf(values.vacuum_total_cleans),
    minutes: countOf(values.vacuum_total_seconds),
  };
}
