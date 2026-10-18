import { HOUR_MS, localDayKey, shiftDay, zonedInstant } from '../../../format/time';

export type MuteChoice = 'off' | 'hour' | 'morning';

const MORNING_MINUTE = 7 * 60;

export function morningAfter(now: number, timeZone: string): number {
  const today = localDayKey(now, timeZone);
  const morning = zonedInstant(today, MORNING_MINUTE, timeZone);
  return morning > now ? morning : zonedInstant(shiftDay(today, 1), MORNING_MINUTE, timeZone);
}

export function muteUntil(choice: MuteChoice, now: number, timeZone: string): string | null {
  if (choice === 'off') {
    return null;
  }
  return new Date(choice === 'hour' ? now + HOUR_MS : morningAfter(now, timeZone)).toISOString();
}
