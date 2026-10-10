import type { ScheduleTiming, ScheduleTimingInput } from '@smarteverything/domain';
import { localClock } from '@smarteverything/domain';
import type { TimeOfDay } from '../../../components/time-field';

export const PRESET_MINUTES: readonly number[] = [5, 15, 30, 60];

export type When =
  | { readonly kind: 'in'; readonly minutes: number }
  | { readonly kind: 'at'; readonly time: TimeOfDay };

export const DEFAULT_WHEN: When = { kind: 'in', minutes: 15 };

export const MOST_MINUTES = 7 * 24 * 60;

export function clampMinutes(minutes: number): number {
  return Math.min(Math.max(Math.round(minutes), 1), MOST_MINUTES);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function timingOf(when: When): ScheduleTimingInput {
  return when.kind === 'in'
    ? { kind: 'in', seconds: when.minutes * 60 }
    : { kind: 'at', at: `${twoDigits(when.time.hour)}:${twoDigits(when.time.minute)}` };
}

export function whenOf(timing: ScheduleTiming, timeZone: string, now: number): When | null {
  switch (timing.kind) {
    case 'in':
      return { kind: 'in', minutes: clampMinutes(timing.seconds / 60) };
    case 'at': {
      const clock = /^(\d\d):(\d\d)$/.exec(timing.at);
      if (clock !== null) {
        return { kind: 'at', time: { hour: Number(clock[1]), minute: Number(clock[2]) } };
      }
      const at = new Date(timing.at);
      if (at.getTime() - now > 86_400_000) {
        return null;
      }
      const local = localClock(at, timeZone);
      return {
        kind: 'at',
        time: { hour: Math.floor(local.minuteOfDay / 60), minute: local.minuteOfDay % 60 },
      };
    }
    case 'series':
    case 'times':
      return null;
  }
}

export function minutesLabel(minutes: number): string {
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

export function whenLabel(when: When): string {
  return when.kind === 'in'
    ? `in ${minutesLabel(when.minutes)}`
    : `at ${twoDigits(when.time.hour)}:${twoDigits(when.time.minute)}`;
}
