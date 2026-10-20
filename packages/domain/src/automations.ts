import { z } from 'zod';
import { nextSunEvent, type GeoPoint, type SunEvent } from './sun';
import { localClock, minuteOfClock, shiftedDate, zonedInstant } from './zoned-clock';

const MINUTE_MS = 60_000;
const WEEK_DAYS = 8;

function isIanaZone(zone: string): boolean {
  if (zone === 'UTC') {
    return true;
  }
  if (!zone.includes('/')) {
    return false;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone === zone;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

export const TIME_ZONE = z.string().refine(isIanaZone, { message: 'not an IANA time zone' });

export type TimedTrigger =
  | { readonly type: 'time'; readonly at: string; readonly weekdays: readonly number[] }
  | {
      readonly type: 'sun';
      readonly event: SunEvent;
      readonly offsetMinutes: number;
    }
  | { readonly type: 'interval'; readonly everyMinutes: number };

function nextTimeOfDay(
  trigger: Extract<TimedTrigger, { type: 'time' }>,
  after: Date,
  timeZone: string,
): Date {
  const today = localClock(after, timeZone);
  const minute = minuteOfClock(trigger.at);
  return Array.from({ length: WEEK_DAYS }, (_, index) => shiftedDate(today, index))
    .filter((date) => trigger.weekdays.includes(date.weekday))
    .map((date) => zonedInstant(date, minute, timeZone))
    .filter((candidate) => candidate.getTime() > after.getTime())
    .reduce((earliest) => earliest);
}

export interface Place {
  readonly timeZone: string;
  readonly location: GeoPoint | null;
}

export class MissingLocationError extends Error {
  override readonly name = 'MissingLocationError';

  constructor() {
    super(
      'A sunrise or sunset trigger needs the home latitude and longitude; the home has none set.',
    );
  }
}

export function nextOccurrence(trigger: TimedTrigger, after: Date, place: Place): Date | null {
  switch (trigger.type) {
    case 'interval':
      return new Date(after.getTime() + trigger.everyMinutes * MINUTE_MS);
    case 'time':
      return nextTimeOfDay(trigger, after, place.timeZone);
    case 'sun':
      if (place.location === null) {
        throw new MissingLocationError();
      }
      return nextSunEvent(
        { event: trigger.event, offsetMinutes: trigger.offsetMinutes, point: place.location },
        after,
      );
  }
}
