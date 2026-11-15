import type { PlannerRingRow, PlannerStats } from '@smarteverything/domain';
import type { Bar } from '../../../components/charts';
import { dayKeyOf, shiftDay, startOfDayKey } from '../../../format/time';
import { bucketLabel, bucketsOf, loadStepOf, rangeDaysOf } from './insights-model';

export interface AlarmSummary {
  readonly spread: number | null;
  readonly snoozes: number;
  readonly missed: number;
  readonly upOnTime: number;
  readonly ringDays: number;
  readonly snoozeBars: readonly Bar[];
}

interface DayTally {
  snoozes: number;
  missed: number;
  rang: boolean;
  snoozed: boolean;
}

function spreadOf(stats: PlannerStats): number | null {
  const timed = stats.alarms.flatMap((alarm) =>
    alarm.spread_minutes === null || alarm.rang === 0
      ? []
      : [{ spread: alarm.spread_minutes, weight: alarm.rang }],
  );
  const weight = timed.reduce((sum, entry) => sum + entry.weight, 0);
  if (weight === 0) return null;
  return Math.round(timed.reduce((sum, entry) => sum + entry.spread * entry.weight, 0) / weight);
}

function tallyByDay(rings: readonly PlannerRingRow[]): ReadonlyMap<string, DayTally> {
  const days = new Map<string, DayTally>();
  for (const ring of rings) {
    if (ring.kind !== 'alarm') continue;
    const day = dayKeyOf(Date.parse(ring.due_at));
    const tally = days.get(day) ?? { snoozes: 0, missed: 0, rang: false, snoozed: false };
    tally.snoozes += ring.snoozes;
    if (ring.outcome === 'missed') tally.missed += 1;
    if (ring.outcome === 'rang') tally.rang = true;
    if (ring.outcome !== 'rang' || ring.snoozes > 0) tally.snoozed = true;
    days.set(day, tally);
  }
  return days;
}

function snoozeBarsOf(stats: PlannerStats, tallies: ReadonlyMap<string, DayTally>): readonly Bar[] {
  const step = loadStepOf(stats.range);
  return bucketsOf(rangeDaysOf(stats), (day) => day, stats.range).flatMap((chunk) => {
    const [first] = chunk;
    if (first === undefined) return [];
    return [
      {
        key: first,
        value: chunk.reduce((sum, day) => sum + (tallies.get(day)?.snoozes ?? 0), 0),
        label: bucketLabel(first, step),
      },
    ];
  });
}

export function alarmSummaryOf(
  stats: PlannerStats,
  rings: readonly PlannerRingRow[],
): AlarmSummary {
  const days = new Set(rangeDaysOf(stats));
  const tallies = new Map([...tallyByDay(rings)].filter(([day]) => days.has(day)));
  const shown = [...tallies.values()];
  return {
    spread: spreadOf(stats),
    snoozes: shown.reduce((sum, tally) => sum + tally.snoozes, 0),
    missed: shown.reduce((sum, tally) => sum + tally.missed, 0),
    upOnTime: shown.filter((tally) => tally.rang && !tally.snoozed).length,
    ringDays: shown.length,
    snoozeBars: snoozeBarsOf(stats, tallies),
  };
}

export function hasAlarmData(summary: AlarmSummary): boolean {
  return summary.ringDays > 0 || summary.snoozes > 0 || summary.missed > 0;
}

export function spreadWordsOf(spread: number | null): string {
  return spread === null ? '–' : `± ${String(spread)}`;
}

export interface RingWindow {
  readonly from: string;
  readonly to: string;
}

export function ringWindowOf(stats: PlannerStats): RingWindow {
  return {
    from: new Date(startOfDayKey(stats.from)).toISOString(),
    to: new Date(startOfDayKey(shiftDay(stats.to, 1))).toISOString(),
  };
}
