import type {
  PlannerPreferences,
  PlannerStopwatchRow,
  PlannerTimerRow,
} from '@smarteverything/domain';
import {
  clock24,
  dayKeyOf,
  localDayKey,
  playTime,
  shiftDay,
  weekdayShort,
} from '../../../format/time';

type WorldClock = PlannerPreferences['clock']['world_clocks'][number];

export function alarmSummaryOf(nextAlarmAt: string | null, now: number): string | null {
  if (nextAlarmAt === null) return null;
  const time = clock24(nextAlarmAt);
  const day = localDayKey(nextAlarmAt);
  const today = dayKeyOf(now);
  if (day === today) return `${time} today`;
  if (day === shiftDay(today, 1)) return `${time} tomorrow`;
  return `${weekdayShort(new Date(nextAlarmAt).getTime())} ${time}`;
}

const nameOf = (timer: PlannerTimerRow): string => timer.label ?? 'Timer';

interface Running {
  readonly timer: PlannerTimerRow;
  readonly endsAt: string;
}

function runningOf(timer: PlannerTimerRow): readonly Running[] {
  return timer.state === 'running' && timer.ends_at !== null
    ? [{ timer, endsAt: timer.ends_at }]
    : [];
}

function soonest(running: readonly Running[]): Running | null {
  return running.reduce<Running | null>(
    (best, item) =>
      best === null || new Date(item.endsAt).getTime() < new Date(best.endsAt).getTime()
        ? item
        : best,
    null,
  );
}

function pausedSummaryOf(paused: readonly PlannerTimerRow[]): string | null {
  const [first] = paused;
  if (first === undefined) return null;
  return paused.length === 1 ? `${nameOf(first)} paused` : `${String(paused.length)} paused`;
}

export function hasRunningTimer(timers: readonly PlannerTimerRow[]): boolean {
  return timers.some((timer) => runningOf(timer).length > 0);
}

function leftOf(endsAt: string, now: number): string {
  return `${playTime(Math.ceil((new Date(endsAt).getTime() - now) / 1000))} left`;
}

export function timerSummaryOf(timers: readonly PlannerTimerRow[], now: number): string | null {
  const running = timers.flatMap(runningOf);
  const next = soonest(running);
  if (next === null) return pausedSummaryOf(timers.filter((timer) => timer.state === 'paused'));
  const left = leftOf(next.endsAt, now);
  return running.length === 1 ? left : `${String(running.length)} running · ${left}`;
}

function elapsedOf(stopwatch: PlannerStopwatchRow | null, now: number): number {
  if (stopwatch === null) return 0;
  if (!stopwatch.running || stopwatch.started_at === null) return stopwatch.accumulated_ms;
  return stopwatch.accumulated_ms + Math.max(0, now - new Date(stopwatch.started_at).getTime());
}

export function stopwatchTimeOf(stopwatch: PlannerStopwatchRow | null, now: number): string {
  return playTime(Math.floor(elapsedOf(stopwatch, now) / 1000));
}

export function stopwatchSummaryOf(
  stopwatch: PlannerStopwatchRow | null,
  now: number,
): string | null {
  if (stopwatch === null) return null;
  const elapsed = stopwatchTimeOf(stopwatch, now);
  if (stopwatch.running) return `Running ${elapsed}`;
  return stopwatch.accumulated_ms === 0 ? null : `Stopped at ${elapsed}`;
}

export function cityOf(world: WorldClock): string {
  return world.label ?? world.time_zone.split('/').at(-1)?.replaceAll('_', ' ') ?? world.time_zone;
}

export function worldSummaryOf(clocks: readonly WorldClock[], now: number): string | null {
  const [first] = clocks;
  if (first === undefined) return null;
  return `${cityOf(first)} ${clock24(now, first.time_zone)}`;
}
