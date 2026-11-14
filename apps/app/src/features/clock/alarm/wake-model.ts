import type { PlannerRingRow, PlannerStats } from '@smarteverything/domain';
import { MINUTE_MS, localDayKey, zonedStartOfDay } from '../../../format/time';
import { alarmSummaryOf } from '../../planner/insights/alarm-model';
import {
  bucketLabel,
  chunksFromEnd,
  loadStepOf,
  rangeDaysOf,
} from '../../planner/insights/insights-model';

export interface WakeBucket {
  readonly key: string;
  readonly label: string;
  readonly alarm: number | null;
  readonly wake: number | null;
}

export interface WakeInsights {
  readonly buckets: readonly WakeBucket[];
  readonly spread: number | null;
  readonly snoozes: number;
  readonly missed: number;
  readonly lostAverage: number | null;
}

interface WakeDay {
  readonly alarm: number;
  readonly wake: number;
}

const HOUR = 60;

function minuteIn(at: number, day: string, timeZone: string): number {
  return Math.round((at - zonedStartOfDay(day, timeZone)) / MINUTE_MS);
}

function wakeAtOf(ring: PlannerRingRow): number {
  return Date.parse(ring.dismissed_at ?? ring.rang_at ?? ring.due_at);
}

function rangAlarms(rings: readonly PlannerRingRow[]): readonly PlannerRingRow[] {
  return rings.filter((ring) => ring.kind === 'alarm' && ring.outcome === 'rang');
}

function firstRingByDay(
  rings: readonly PlannerRingRow[],
  timeZone: string,
): ReadonlyMap<string, PlannerRingRow> {
  const days = new Map<string, PlannerRingRow>();
  for (const ring of rangAlarms(rings)) {
    const day = localDayKey(ring.due_at, timeZone);
    const held = days.get(day);
    if (held === undefined || Date.parse(ring.due_at) < Date.parse(held.due_at)) {
      days.set(day, ring);
    }
  }
  return days;
}

function wakeDaysOf(
  rings: readonly PlannerRingRow[],
  timeZone: string,
): ReadonlyMap<string, WakeDay> {
  const days = new Map<string, WakeDay>();
  for (const [day, ring] of firstRingByDay(rings, timeZone)) {
    days.set(day, {
      alarm: minuteIn(Date.parse(ring.due_at), day, timeZone),
      wake: minuteIn(wakeAtOf(ring), day, timeZone),
    });
  }
  return days;
}

function meanOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function bucketsOf(stats: PlannerStats, days: ReadonlyMap<string, WakeDay>): readonly WakeBucket[] {
  const step = loadStepOf(stats.range);
  return chunksFromEnd(rangeDaysOf(stats), step).flatMap((chunk) => {
    const [first] = chunk;
    if (first === undefined) return [];
    const shown = chunk.flatMap((day) => {
      const wake = days.get(day);
      return wake === undefined ? [] : [wake];
    });
    return [
      {
        key: first,
        label: bucketLabel(first, step),
        alarm: meanOf(shown.map((day) => day.alarm)),
        wake: meanOf(shown.map((day) => day.wake)),
      },
    ];
  });
}

function lostAverageOf(rings: readonly PlannerRingRow[]): number | null {
  const lost = rangAlarms(rings)
    .filter((ring) => ring.snoozes > 0)
    .map((ring) => Math.max(0, (wakeAtOf(ring) - Date.parse(ring.due_at)) / MINUTE_MS));
  return meanOf(lost);
}

export function wakeInsightsOf(
  stats: PlannerStats,
  rings: readonly PlannerRingRow[],
  timeZone: string,
): WakeInsights {
  const summary = alarmSummaryOf(stats, rings);
  return {
    buckets: bucketsOf(stats, wakeDaysOf(rings, timeZone)),
    spread: summary.spread,
    snoozes: summary.snoozes,
    missed: summary.missed,
    lostAverage: lostAverageOf(rings),
  };
}

export function hasWakeData(insights: WakeInsights): boolean {
  return (
    insights.buckets.some((bucket) => bucket.alarm !== null) ||
    insights.snoozes > 0 ||
    insights.missed > 0
  );
}

export interface WakeScale {
  readonly from: number;
  readonly to: number;
  readonly ticks: readonly number[];
}

export function wakeScaleOf(buckets: readonly WakeBucket[]): WakeScale | null {
  const minutes = buckets.flatMap((bucket) =>
    bucket.alarm === null || bucket.wake === null ? [] : [bucket.alarm, bucket.wake],
  );
  if (minutes.length === 0) return null;
  const from = Math.floor(Math.min(...minutes) / HOUR) * HOUR;
  const top = Math.ceil(Math.max(...minutes) / HOUR) * HOUR;
  const to = top === from ? from + HOUR : top;
  const ticks: number[] = [];
  for (let tick = from; tick <= to; tick += HOUR) ticks.push(tick);
  return { from, to, ticks };
}

export function wakeSpokenOf(bucket: WakeBucket, clockOf: (minute: number) => string): string {
  if (bucket.alarm === null || bucket.wake === null) return `${bucket.label}: no alarm rang`;
  return `${bucket.label}: alarm ${clockOf(bucket.alarm)}, awake ${clockOf(bucket.wake)}`;
}
