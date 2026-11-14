import { localClock, sunEventOn, type CalendarDate, type GeoPoint } from '@smarteverything/domain';
import { clock24, HOUR_MS } from '../../../format/time';

const DAY_MINUTES = 1440;

const ALWAYS_RISING_LATITUDE = 60;

const HALF_DAY_MS = 12 * HOUR_MS;

export interface DaylightSpan {
  readonly from: number;
  readonly to: number;
}

export type Daylight =
  | {
      readonly kind: 'sun';
      readonly rise: string;
      readonly set: string;
      readonly spans: readonly DaylightSpan[];
    }
  | { readonly kind: 'polar_day'; readonly spans: readonly DaylightSpan[] }
  | { readonly kind: 'polar_night'; readonly spans: readonly DaylightSpan[] }
  | { readonly kind: 'unknown'; readonly spans: readonly DaylightSpan[] };

const WHOLE_DAY: readonly DaylightSpan[] = [{ from: 0, to: 1 }];

const NO_DAYLIGHT: readonly DaylightSpan[] = [];

export const UNKNOWN_DAYLIGHT: Daylight = { kind: 'unknown', spans: NO_DAYLIGHT };

export function dayShareOf(at: number, zone: string): number {
  return localClock(new Date(at), zone).minuteOfDay / DAY_MINUTES;
}

export function spansOf(rise: number, set: number): readonly DaylightSpan[] {
  if (rise <= set) return [{ from: rise, to: set }];
  return [
    { from: 0, to: set },
    { from: rise, to: 1 },
  ];
}

function polarDayOn(date: CalendarDate, point: GeoPoint): boolean {
  const nearer = {
    latitude: Math.sign(point.latitude) * ALWAYS_RISING_LATITUDE,
    longitude: point.longitude,
  };
  const rise = sunEventOn('sunrise', date, nearer);
  const set = sunEventOn('sunset', date, nearer);
  if (rise === null || set === null) return false;
  return set.getTime() - rise.getTime() > HALF_DAY_MS;
}

export function daylightOf(at: number, zone: string, point: GeoPoint | null): Daylight {
  if (point === null) return UNKNOWN_DAYLIGHT;
  const today = localClock(new Date(at), zone);
  const rise = sunEventOn('sunrise', today, point);
  const set = sunEventOn('sunset', today, point);
  if (rise === null || set === null) {
    return polarDayOn(today, point)
      ? { kind: 'polar_day', spans: WHOLE_DAY }
      : { kind: 'polar_night', spans: NO_DAYLIGHT };
  }
  return {
    kind: 'sun',
    rise: clock24(rise, zone),
    set: clock24(set, zone),
    spans: spansOf(dayShareOf(rise.getTime(), zone), dayShareOf(set.getTime(), zone)),
  };
}

export function daylightLineOf(daylight: Daylight): string | null {
  switch (daylight.kind) {
    case 'sun':
      return `Sunrise ${daylight.rise}, sunset ${daylight.set}`;
    case 'polar_day':
      return 'The sun stays up all day';
    case 'polar_night':
      return 'The sun stays down all day';
    case 'unknown':
      return null;
  }
}
