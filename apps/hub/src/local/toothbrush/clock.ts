import { sessionDayOf, zoneOffsetSeconds } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export interface HomeClock {
  readonly offsetOf: (instant: Date) => number;
  readonly dayOf: (instant: Date, dayStartHour: number) => string;
}

export function homeClock(store: Pick<Store, 'settings'>): HomeClock {
  const offsetOf = (instant: Date): number =>
    zoneOffsetSeconds(store.settings.read().time_zone, instant);
  return {
    offsetOf,
    dayOf: (instant, dayStartHour): string =>
      sessionDayOf(instant.toISOString(), offsetOf(instant) - dayStartHour * 3600),
  };
}
