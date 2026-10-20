import {
  bottleDayOfInstant,
  bottleMinuteOfInstant,
  zoneOffsetSeconds,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';

export interface HomeClock {
  readonly offsetOf: (instant: Date) => number;
  readonly dayOf: (instant: Date) => string;
  readonly minuteOf: (instant: Date) => number;
}

export function homeClock(store: Pick<Store, 'settings'>): HomeClock {
  const offsetOf = (instant: Date): number =>
    zoneOffsetSeconds(store.settings.read().time_zone, instant);
  return {
    offsetOf,
    dayOf: (instant): string => bottleDayOfInstant(instant.toISOString(), offsetOf(instant)),
    minuteOf: (instant): number => bottleMinuteOfInstant(instant.toISOString(), offsetOf(instant)),
  };
}
