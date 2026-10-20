import {
  GEO_POINT,
  TIME_ZONE,
  localClock,
  zonedInstant,
  type CalendarDate,
  type Place,
} from '@smarteverything/domain';
import type { Window } from '../model/consumers/week-schedule';

export interface HomePlace {
  readonly time_zone: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export type PlaceReading =
  | { readonly usable: true; readonly place: Place }
  | { readonly usable: false; readonly problem: string };

export function placeOf(home: HomePlace): PlaceReading {
  if (!TIME_ZONE.safeParse(home.time_zone).success) {
    return { usable: false, problem: 'Your home’s time zone isn’t valid.' };
  }
  const location = GEO_POINT.safeParse({ latitude: home.latitude, longitude: home.longitude });
  return {
    usable: true,
    place: { timeZone: home.time_zone, location: location.success ? location.data : null },
  };
}

function dateAfter(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function dayWindow(now: Date, timeZone: string, offsetDays: number, days = 1): Window {
  const today = localClock(now, timeZone);
  return {
    start: zonedInstant(dateAfter(today, offsetDays), 0, timeZone),
    end: zonedInstant(dateAfter(today, offsetDays + days), 0, timeZone),
  };
}
