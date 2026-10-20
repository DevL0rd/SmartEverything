import type { AutomationRunSummary } from '@smarteverything/domain';
import { ACTIVE_RUN_RECORD_STATUSES, appendTo } from '@smarteverything/domain';
import { HOUR_MS, localDayKey, shiftDay } from '../../../format/time';
import type { ChartPoint } from '../../../components/charts';

export const WEEK_DAYS = 7;
export const DAY_HOURS = 24;

export interface DayBar {
  readonly day: string;
  readonly succeeded: number;
  readonly failed: number;
  readonly ignored: number;
}

export interface RunStats {
  readonly days: readonly DayBar[];
  readonly total: number;
  readonly failed: number;
  readonly active: number;
  readonly waiting: number;
}

type Outcome = 'succeeded' | 'failed' | 'ignored';

const OUTCOME: Readonly<Partial<Record<AutomationRunSummary['status'], Outcome>>> = {
  succeeded: 'succeeded',
  failed: 'failed',
  interrupted: 'failed',
  ignored: 'ignored',
};

export function weekKeys(today: string): readonly string[] {
  return Array.from({ length: WEEK_DAYS }, (_, index) => shiftDay(today, index - (WEEK_DAYS - 1)));
}

function emptyDays(keys: readonly string[]): DayBar[] {
  return keys.map((day) => ({ day, succeeded: 0, failed: 0, ignored: 0 }));
}

function statsOf(
  runs: readonly AutomationRunSummary[],
  keys: readonly string[],
  timeZone: string | null,
): RunStats {
  const days = emptyDays(keys).map((bar) => {
    const counts = { succeeded: 0, failed: 0, ignored: 0 };
    for (const run of runs) {
      const outcome = OUTCOME[run.status];
      if (outcome !== undefined && localDayKey(run.created_at, timeZone) === bar.day) {
        counts[outcome] += 1;
      }
    }
    return { ...bar, ...counts };
  });
  const sum = (pick: (bar: DayBar) => number): number =>
    days.reduce((total, bar) => total + pick(bar), 0);
  return {
    days,
    total: sum((bar) => bar.succeeded + bar.failed),
    failed: sum((bar) => bar.failed),
    active: runs.filter((run) => ACTIVE_RUN_RECORD_STATUSES.has(run.status)).length,
    waiting: runs.filter((run) => run.status === 'waiting').length,
  };
}

export function statsByAutomation(
  runs: readonly AutomationRunSummary[],
  today: string,
  timeZone: string | null,
): ReadonlyMap<string, RunStats> {
  const keys = weekKeys(today);
  const grouped = new Map<string, AutomationRunSummary[]>();
  for (const run of runs) {
    if (run.mode === 'live') appendTo(grouped, run.automation_id, run);
  }
  return new Map([...grouped].map(([id, group]) => [id, statsOf(group, keys, timeZone)]));
}

export const NO_STATS: RunStats = { days: [], total: 0, failed: 0, active: 0, waiting: 0 };

export interface Health {
  readonly runsToday: number;
  readonly failedToday: number;
  readonly waiting: number;
  readonly perHour: readonly ChartPoint[];
  readonly failedPerHour: readonly ChartPoint[];
}

function hourSeries(times: readonly number[], now: number): readonly ChartPoint[] {
  const start = now - DAY_HOURS * HOUR_MS;
  const counts = Array.from({ length: DAY_HOURS }, () => 0);
  for (const at of times) {
    const slot = Math.floor((at - start) / HOUR_MS);
    if (slot >= 0 && slot < DAY_HOURS) counts[slot] = (counts[slot] ?? 0) + 1;
  }
  return counts.map((v, slot) => ({ t: start + slot * HOUR_MS, v }));
}

export function healthOf(
  runs: readonly AutomationRunSummary[],
  now: number,
  timeZone: string | null,
): Health {
  const today = localDayKey(now, timeZone);
  const live = runs.filter((run) => run.mode === 'live');
  const todays = live.filter((run) => localDayKey(run.created_at, timeZone) === today);
  const failed = (run: AutomationRunSummary): boolean => OUTCOME[run.status] === 'failed';
  const counted = (run: AutomationRunSummary): boolean => {
    const outcome = OUTCOME[run.status];
    return outcome !== undefined && outcome !== 'ignored';
  };
  const stamp = (run: AutomationRunSummary): number => Date.parse(run.created_at);
  return {
    runsToday: todays.filter(counted).length,
    failedToday: todays.filter(failed).length,
    waiting: live.filter((run) => run.status === 'waiting').length,
    perHour: hourSeries(live.filter(counted).map(stamp), now),
    failedPerHour: hourSeries(live.filter(failed).map(stamp), now),
  };
}

export interface StackSegment {
  readonly outcome: Outcome;
  readonly height: number;
}

export function stackOf(day: DayBar, peak: number, maxHeight: number): readonly StackSegment[] {
  if (peak === 0) return [];
  const outcomes: readonly Outcome[] = ['succeeded', 'failed', 'ignored'];
  return outcomes.flatMap((outcome) =>
    day[outcome] === 0
      ? []
      : [{ outcome, height: Math.max(2, Math.round((day[outcome] / peak) * maxHeight)) }],
  );
}

export function peakOf(days: readonly DayBar[]): number {
  return Math.max(0, ...days.map((day) => day.succeeded + day.failed + day.ignored));
}

export function statsLine(stats: RunStats, runCount: number): string {
  const parts = [`7 days · ${String(stats.total)} ${stats.total === 1 ? 'run' : 'runs'}`];
  if (stats.failed > 0) parts.push(`${String(stats.failed)} failed`);
  if (runCount > stats.total) parts.push(`${String(runCount)} in all`);
  return parts.join(' · ');
}
