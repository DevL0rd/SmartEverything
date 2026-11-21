import {
  bottleDayOfInstant,
  bottleMinuteOfInstant,
  zoneOffsetSeconds,
} from '@smarteverything/domain';
import type { SettingsRow } from '@smarteverything/domain';

export interface HomeClock {
  readonly offsetOf: (instant: Date) => number;
  readonly dayOf: (instant: Date) => string;
  readonly minuteOf: (instant: Date) => number;
}

export interface HomeSettings {
  readonly read: () => Pick<SettingsRow, 'time_zone'>;
}

export function homeClock(settings: HomeSettings): HomeClock {
  const offsetOf = (instant: Date): number => zoneOffsetSeconds(settings.read().time_zone, instant);
  return {
    offsetOf,
    dayOf: (instant): string => bottleDayOfInstant(instant.toISOString(), offsetOf(instant)),
    minuteOf: (instant): number => bottleMinuteOfInstant(instant.toISOString(), offsetOf(instant)),
  };
}
