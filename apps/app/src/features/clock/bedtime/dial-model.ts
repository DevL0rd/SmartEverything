import { minuteOfClock, type PlannerBedtimeNight } from '@smarteverything/domain';
import type { ClockFormat } from '../../../format/clock-text';
import { clockOfMinutes } from '../../../format/time';

export const DAY_MINUTES = 24 * 60;

const FULL_TURN = 360;

export const DIAL_STEP_MINUTES = 5;

export type DialHandle = 'bed' | 'wake';

export interface DialTimes {
  readonly bed: number;
  readonly wake: number;
}

export interface DialArc {
  readonly start: number;
  readonly sweep: number;
}

export interface DialTick {
  readonly minute: number;
  readonly angle: number;
  readonly label: string | null;
}

export function wrapMinute(minute: number): number {
  return ((Math.round(minute) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

export function angleOfMinute(minute: number): number {
  return (wrapMinute(minute) / DAY_MINUTES) * FULL_TURN;
}

export function minuteOfAngle(angle: number, step = DIAL_STEP_MINUTES): number {
  const turn = ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
  return wrapMinute(Math.round(((turn / FULL_TURN) * DAY_MINUTES) / step) * step);
}

export function sleepMinutesOf(times: DialTimes): number {
  const span = wrapMinute(times.wake - times.bed);
  return span === 0 ? DAY_MINUTES : span;
}

export function dialTimesOf(night: Pick<PlannerBedtimeNight, 'bed' | 'wake'>): DialTimes {
  return { bed: minuteOfClock(night.bed), wake: minuteOfClock(night.wake) };
}

export function nightTimesOf(times: DialTimes): { readonly bed: string; readonly wake: string } {
  return { bed: clockOfMinutes(times.bed), wake: clockOfMinutes(times.wake) };
}

export function sleepArcOf(times: DialTimes): DialArc {
  return {
    start: angleOfMinute(times.bed),
    sweep: (sleepMinutesOf(times) / DAY_MINUTES) * FULL_TURN,
  };
}

export function windDownArcOf(times: DialTimes, minutes: number | null): DialArc | null {
  if (minutes === null) return null;
  const span = Math.min(minutes, DAY_MINUTES - sleepMinutesOf(times));
  if (span <= 0) return null;
  return {
    start: angleOfMinute(times.bed - span),
    sweep: (span / DAY_MINUTES) * FULL_TURN,
  };
}

export function dialTicks(format: ClockFormat): readonly DialTick[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    minute: hour * 60,
    angle: (hour / 24) * FULL_TURN,
    label: hour % 6 === 0 ? format.hour(hour) : null,
  }));
}

function angularDistance(left: number, right: number): number {
  const gap = Math.abs(left - right) % FULL_TURN;
  return gap > FULL_TURN / 2 ? FULL_TURN - gap : gap;
}

export function nearestHandle(times: DialTimes, angle: number): DialHandle {
  const bed = angularDistance(angleOfMinute(times.bed), angle);
  const wake = angularDistance(angleOfMinute(times.wake), angle);
  return bed <= wake ? 'bed' : 'wake';
}

export function movedTimes(times: DialTimes, handle: DialHandle, minute: number): DialTimes {
  const next = wrapMinute(minute);
  const other = handle === 'bed' ? times.wake : times.bed;
  const safe =
    next === other ? wrapMinute(next + (handle === 'bed' ? -1 : 1) * DIAL_STEP_MINUTES) : next;
  return handle === 'bed' ? { bed: safe, wake: times.wake } : { bed: times.bed, wake: safe };
}

export function nudgedTimes(times: DialTimes, handle: DialHandle, steps: number): DialTimes {
  const from = handle === 'bed' ? times.bed : times.wake;
  return movedTimes(times, handle, from + steps * DIAL_STEP_MINUTES);
}

export function sleepLengthText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

export function dialSpokenOf(times: DialTimes, format: ClockFormat): string {
  return `Bed ${format.minutes(times.bed)}, wake ${format.minutes(times.wake)}, ${sleepLengthText(sleepMinutesOf(times))} in bed`;
}
