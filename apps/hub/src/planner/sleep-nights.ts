import {
  asleepMinutes,
  PLANNER_SLEEP,
  type HealthRecord,
  type PlannerSleep,
  type PlannerSleepNight,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { fromPreferredSource } from '../store/health-sources-priority';
import type { SleepSpan } from './day';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SAME_NIGHT_GAP_MS = 3 * HOUR_MS;
const WEEK_DAYS = 7;

type SleepRecord = Extract<HealthRecord, { readonly type: 'SleepSession' }>;

export type SleepStore = Pick<Store, 'health'>;

export interface SleepCluster {
  readonly bed: number;
  readonly woke: number;
  readonly asleep: number;
}

function sleepSessions(records: readonly HealthRecord[]): SleepRecord[] {
  return fromPreferredSource(
    records.filter((record): record is SleepRecord => record.type === 'SleepSession'),
  )
    .filter((record) => Date.parse(record.startTime) < Date.parse(record.endTime))
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
}

export function clustersOf(records: readonly HealthRecord[]): readonly SleepCluster[] {
  const clusters: SleepCluster[] = [];
  for (const session of sleepSessions(records)) {
    const bed = Date.parse(session.startTime);
    const woke = Date.parse(session.endTime);
    const asleep = asleepMinutes(session);
    const last = clusters.at(-1);
    if (last !== undefined && bed - last.woke < SAME_NIGHT_GAP_MS) {
      clusters[clusters.length - 1] = {
        bed: Math.min(last.bed, bed),
        woke: Math.max(last.woke, woke),
        asleep: last.asleep + asleep,
      };
    } else {
      clusters.push({ bed, woke, asleep });
    }
  }
  return clusters;
}

function dateOf(moment: number, zone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(moment)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}

export function nightsOf(
  clusters: readonly SleepCluster[],
  zone: string,
): readonly PlannerSleepNight[] {
  const longest = new Map<string, SleepCluster>();
  for (const cluster of clusters) {
    const date = dateOf(cluster.woke, zone);
    const held = longest.get(date);
    if (held === undefined || cluster.asleep > held.asleep) longest.set(date, cluster);
  }
  return [...longest]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, cluster]) => ({
      date,
      bed_at: new Date(cluster.bed).toISOString(),
      woke_at: new Date(cluster.woke).toISOString(),
      asleep_minutes: Math.round(cluster.asleep),
    }));
}

export interface SleepRange {
  readonly profileId: string;
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
}

function weekStart(to: number, zone: string): number {
  return Temporal.Instant.fromEpochMilliseconds(to)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .subtract({ days: WEEK_DAYS - 1 })
    .toZonedDateTime(zone)
    .toInstant().epochMilliseconds;
}

export function readSleep(store: SleepStore, range: SleepRange): PlannerSleep {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const weekFrom = weekStart(to, range.timeZone);
  const records = store.health.records(
    {
      types: ['SleepSession'],
      from: new Date(Math.min(from, weekFrom) - DAY_MS).toISOString(),
      to: new Date(to).toISOString(),
    },
    range.profileId,
  );
  const nights = nightsOf(clustersOf(records), range.timeZone);
  const within = (night: PlannerSleepNight, lower: number): boolean => {
    const woke = Date.parse(night.woke_at);
    return woke >= lower && woke <= to;
  };
  const week = nights.filter((night) => within(night, weekFrom));
  return PLANNER_SLEEP.parse({
    nights: nights.filter((night) => within(night, from)),
    week_average_minutes:
      week.length === 0
        ? null
        : Math.round(week.reduce((total, night) => total + night.asleep_minutes, 0) / week.length),
  });
}

export function sleepSpansOn(
  store: SleepStore,
  profileId: string,
  date: string,
  zone: string,
): readonly SleepSpan[] {
  const start = Temporal.PlainDate.from(date).toZonedDateTime(zone);
  const dayStart = start.toInstant().epochMilliseconds;
  const dayEnd = start.add({ days: 1 }).toInstant().epochMilliseconds;
  const records = store.health.records(
    {
      types: ['SleepSession'],
      from: new Date(dayStart - DAY_MS).toISOString(),
      to: new Date(dayEnd).toISOString(),
    },
    profileId,
  );
  return clustersOf(records)
    .filter((cluster) => cluster.bed < dayEnd && cluster.woke > dayStart)
    .map((cluster) => ({
      from: Temporal.Instant.fromEpochMilliseconds(cluster.bed),
      to: Temporal.Instant.fromEpochMilliseconds(cluster.woke),
    }));
}
