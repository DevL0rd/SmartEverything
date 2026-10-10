import { MINUTE_MS, startOfDayKey, zoneOffsetSecondsAt } from '../../../format/time';

export function momentOn(day: string, now: number): number {
  const today = new Date(now);
  const at = new Date(startOfDayKey(day));
  at.setHours(today.getHours(), today.getMinutes(), 0, 0);
  return at.getTime();
}

export function entrySpan(start: number): {
  readonly startTime: string;
  readonly endTime: string;
  readonly zoneOffsetSeconds: number;
} {
  return {
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + MINUTE_MS).toISOString(),
    zoneOffsetSeconds: zoneOffsetSecondsAt(start),
  };
}
