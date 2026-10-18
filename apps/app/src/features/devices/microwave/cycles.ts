import type { DeviceLogEntry } from '@smarteverything/domain';
import { clock, dayLabel, duration } from '../../../format/time';

export const CYCLE_WINDOW = 30;

export const HISTORY_CYCLES = 10;

export const PANEL_CYCLES = 2;

export const QUICK_CYCLES = 3;

const MILLIS = 1000;

export function cyclesOf(entries: readonly DeviceLogEntry[]): readonly DeviceLogEntry[] {
  return entries.filter((entry) => entry.kind === 'cycle');
}

export interface CycleRow {
  readonly key: string;
  readonly what: string;
  readonly when: string;
  readonly ended: string;
  readonly finished: boolean;
}

export function cycleRow(entry: DeviceLogEntry, now: number): CycleRow {
  const start = entry.started_at ?? entry.at;
  const ran = Math.max(0, Date.parse(entry.at) - Date.parse(start)) / MILLIS;
  return {
    key: entry.at,
    what: entry.value ?? entry.title,
    when: `${dayLabel(start, now)} ${clock(start)} – ${clock(entry.at)} · ${duration(ran)}`,
    ended: clock(entry.at),
    finished: entry.title === 'Cooking finished',
  };
}
