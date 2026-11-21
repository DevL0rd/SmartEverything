import { sessionDayOf, zoneOffsetSeconds } from '@smarteverything/domain';
import type { SettingsRow } from '@smarteverything/domain';

export interface HomeClock {
  readonly offsetOf: (instant: Date) => number;
  readonly dayOf: (instant: Date, dayStartHour: number) => string;
}

export interface HomeSettings {
  readonly read: () => Pick<SettingsRow, 'time_zone'>;
}

export function homeClock(settings: HomeSettings): HomeClock {
  const offsetOf = (instant: Date): number => zoneOffsetSeconds(settings.read().time_zone, instant);
  return {
    offsetOf,
    dayOf: (instant, dayStartHour): string =>
      sessionDayOf(instant.toISOString(), offsetOf(instant) - dayStartHour * 3600),
  };
}
