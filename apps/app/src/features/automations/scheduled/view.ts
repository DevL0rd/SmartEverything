import {
  SCHEDULE_LIMITS,
  isScheduleActive,
  type ScheduleResult,
  type ScheduleRow,
  type ScheduleState,
} from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';
import { clock, duration, moment, playTime } from '../../../format/time';

const HOUR_SECONDS = 3600;

export const STATE_LOOK: Readonly<
  Record<ScheduleState, { readonly label: string; readonly tone: StatusTone | 'neutral' }>
> = {
  scheduled: { label: 'Waiting', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  waiting: { label: 'Paused for a wait', tone: 'info' },
  done: { label: 'Done', tone: 'positive' },
  failed: { label: 'Didn’t fully work', tone: 'critical' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function titleOf(row: ScheduleRow): string {
  return row.label ?? row.step_lines.find((line) => line !== null) ?? 'Scheduled action';
}

export function upcomingOf(rows: readonly ScheduleRow[]): ScheduleRow[] {
  return rows.filter((row) => isScheduleActive(row.state));
}

export function finishedOf(rows: readonly ScheduleRow[]): ScheduleRow[] {
  return rows.filter((row) => !isScheduleActive(row.state));
}

export function forDevice(rows: readonly ScheduleRow[], deviceId: string): ScheduleRow[] {
  return upcomingOf(rows).filter((row) => row.device_ids.includes(deviceId));
}

export function secondsLeft(row: ScheduleRow, now: number): number | null {
  return row.next_at === null ? null : Math.max(0, (Date.parse(row.next_at) - now) / 1000);
}

export function countdown(seconds: number): string {
  return seconds < HOUR_SECONDS ? playTime(seconds) : duration(Math.ceil(seconds / 60) * 60);
}

function finishedLine(row: ScheduleRow, now: number, timeZone: string | null): string {
  const label = STATE_LOOK[row.state].label;
  return row.finished_at === null ? label : `${label} · ${moment(row.finished_at, now, timeZone)}`;
}

export function whenLine(row: ScheduleRow, now: number, timeZone: string | null): string {
  const left = secondsLeft(row, now);
  switch (row.state) {
    case 'running':
      return 'Running now';
    case 'waiting':
      return left === null ? 'Waiting' : `Next step in ${countdown(left)}`;
    case 'scheduled':
      return left === null || row.next_at === null
        ? 'Waiting'
        : `In ${countdown(left)} · ${clock(row.next_at, timeZone)}`;
    case 'done':
    case 'failed':
    case 'cancelled':
      return finishedLine(row, now, timeZone);
  }
}

export function runsLine(row: ScheduleRow): string | null {
  const total = row.occurrences.length;
  if (total < 2) {
    return null;
  }
  const done = Math.min(row.occurrence + (isScheduleActive(row.state) ? 0 : 1), total);
  return `${String(done)} of ${String(total)} runs`;
}

export function lateLine(row: ScheduleRow): string | null {
  const late = Math.max(0, ...row.results.map((result) => result.late_ms));
  return late < SCHEDULE_LIMITS.lateAfterMs ? null : `Ran ${duration(late / 1000)} late`;
}

export function latestResult(row: ScheduleRow, step: number): ScheduleResult | null {
  return row.results.findLast((result) => result.step === step) ?? null;
}

export function missedResults(row: ScheduleRow): ScheduleResult[] {
  return row.results.filter((result) => result.outcome === 'missed');
}

export function canEdit(row: ScheduleRow): boolean {
  return row.state === 'scheduled' || row.state === 'waiting';
}
