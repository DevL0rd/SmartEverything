import { localClock } from '@smarteverything/domain';

export interface HomeClock {
  readonly now: () => Date;
  readonly timeZone: () => string;
}

const PAD = 2;

export function dayKeyOf(at: Date, zone: string): string {
  const clock = localClock(at, zone);
  const month = String(clock.month).padStart(PAD, '0');
  const day = String(clock.day).padStart(PAD, '0');
  return `${String(clock.year)}-${month}-${day}`;
}

export function minuteOfDayOf(at: Date, zone: string): number {
  return localClock(at, zone).minuteOfDay;
}

export function hourOf(at: Date, zone: string): number {
  return Math.floor(minuteOfDayOf(at, zone) / 60);
}
