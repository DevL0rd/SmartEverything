import {
  BOTTLE_COLOURS,
  bottleClockOfSeconds,
  secondsOfBottleClock,
  type BottleQuiet,
  type BottleReminder,
} from '@smarteverything/domain';

const DIAL_STEP_MIN = 15;

export const MINUTES_PER_DAY = 1440;

export const INTERVALS: readonly number[] = [15, 20, 30, 45, 60, 90, 120];

export function minutesOfClock(clock: string): number {
  return Math.floor(secondsOfBottleClock(clock) / 60) % MINUTES_PER_DAY;
}

export function clockOfMinutes(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return bottleClockOfSeconds(wrapped * 60);
}

export function angleOfMinutes(minutes: number): number {
  return (minutes / MINUTES_PER_DAY) * 360;
}

export function minutesAtAngle(degrees: number): number {
  const raw = (((degrees % 360) + 360) % 360) / 360;
  const snapped = Math.round((raw * MINUTES_PER_DAY) / DIAL_STEP_MIN) * DIAL_STEP_MIN;
  return snapped % MINUTES_PER_DAY;
}

export function nudgeClock(clock: string, direction: 1 | -1): string {
  return clockOfMinutes(minutesOfClock(clock) + direction * DIAL_STEP_MIN);
}

export interface Window {
  readonly from: string;
  readonly to: string;
}

export function sweepOf(window: Window): { readonly start: number; readonly sweep: number } {
  const from = minutesOfClock(window.from);
  const to = minutesOfClock(window.to);
  const length = (to - from + MINUTES_PER_DAY) % MINUTES_PER_DAY || MINUTES_PER_DAY;
  return { start: angleOfMinutes(from), sweep: angleOfMinutes(length) };
}

export type Handle = 'from' | 'to';

export function nearestHandle(window: Window, minutes: number): Handle {
  const gap = (clock: string): number => {
    const diff = Math.abs(minutesOfClock(clock) - minutes);
    return Math.min(diff, MINUTES_PER_DAY - diff);
  };
  return gap(window.from) <= gap(window.to) ? 'from' : 'to';
}

export function moved(window: Window, handle: Handle, minutes: number): Window {
  const clock = clockOfMinutes(minutes);
  return handle === 'from' ? { from: clock, to: window.to } : { from: window.from, to: clock };
}

export function windowText(window: Window): string {
  return `${window.from} to ${window.to}`;
}

export function reminderLine(reminder: BottleReminder | null): string {
  if (reminder === null) {
    return 'Not read from the bottle yet';
  }
  if (reminder.state === 'off') {
    return 'Off';
  }
  return `Every ${String(reminder.intervalMin)} min, ${windowText(reminder)}`;
}

export function quietLine(quiet: BottleQuiet | null): string {
  if (quiet === null) {
    return 'Not read from the bottle yet';
  }
  switch (quiet.state) {
    case 'off':
      return 'Off';
    case 'auto':
      return `Automatic, ${windowText(quiet)}`;
    default:
      return `On, ${windowText(quiet)}`;
  }
}

export function swatchOfHex(hex: string): (typeof BOTTLE_COLOURS)[number]['id'] {
  return BOTTLE_COLOURS.find((colour) => colour.hex === hex)?.id ?? 'white';
}

export function hexOfSwatch(id: (typeof BOTTLE_COLOURS)[number]['id']): string {
  return BOTTLE_COLOURS.find((colour) => colour.id === id)?.hex ?? '#ffffff';
}

const CALIBRATION_LEVELS = 11;

export function calibrationLevels(body: number): readonly number[] {
  return Array.from(
    { length: CALIBRATION_LEVELS },
    (_, index) => Math.round((body * (0.08 + (0.92 * index) / (CALIBRATION_LEVELS - 1))) / 5) * 5,
  );
}
