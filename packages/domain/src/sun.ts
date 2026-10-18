import { z } from 'zod';

export const SUN_EVENTS = ['sunrise', 'sunset'] as const;

export type SunEvent = (typeof SUN_EVENTS)[number];

export const GEO_POINT = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type GeoPoint = z.infer<typeof GEO_POINT>;

export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const ZENITH_DEGREES = 90.833;
const SEARCH_DAYS = 372;
const FIRST_SEARCH_DAY = -1;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function degrees(angle: number): number {
  return (angle * 180) / Math.PI;
}

function midnightOf(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function fractionalYear(date: CalendarDate): number {
  const startOfYear = Date.UTC(date.year, 0, 1);
  const daysInYear = (Date.UTC(date.year + 1, 0, 1) - startOfYear) / DAY_MS;
  const dayIndex = (midnightOf(date) - startOfYear) / DAY_MS;
  return ((2 * Math.PI) / daysInYear) * dayIndex;
}

function equationOfTime(gamma: number): number {
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  );
}

function declination(gamma: number): number {
  return (
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)
  );
}

export function sunEventOn(event: SunEvent, date: CalendarDate, point: GeoPoint): Date | null {
  const gamma = fractionalYear(date);
  const sunDeclination = declination(gamma);
  const latitude = radians(point.latitude);
  const hourAngle = degrees(
    Math.acos(
      Math.cos(radians(ZENITH_DEGREES)) / (Math.cos(latitude) * Math.cos(sunDeclination)) -
        Math.tan(latitude) * Math.tan(sunDeclination),
    ),
  );
  if (Number.isNaN(hourAngle)) {
    return null;
  }
  const signedAngle = event === 'sunrise' ? hourAngle : -hourAngle;
  const minutes = 720 - 4 * (point.longitude + signedAngle) - equationOfTime(gamma);
  return new Date(midnightOf(date) + minutes * MINUTE_MS);
}

function utcDateAfter(instant: Date, days: number): CalendarDate {
  const shifted = new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate() + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export interface SunSchedule {
  readonly event: SunEvent;
  readonly offsetMinutes: number;
  readonly point: GeoPoint;
}

export function nextSunEvent(schedule: SunSchedule, after: Date): Date | null {
  for (let day = FIRST_SEARCH_DAY; day < SEARCH_DAYS + FIRST_SEARCH_DAY; day += 1) {
    const event = sunEventOn(schedule.event, utcDateAfter(after, day), schedule.point);
    if (event === null) {
      continue;
    }
    const shifted = event.getTime() + schedule.offsetMinutes * MINUTE_MS;
    if (shifted > after.getTime()) {
      return new Date(shifted);
    }
  }
  return null;
}
