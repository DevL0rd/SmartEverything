import {
  clockFormatOf,
  clockLabelOf,
  clockPartsOf,
  type ClockFormat,
  type ClockParts,
} from '../format/clock-text';
import { clockIn } from '../format/time';
import { PREFS, prefValueOf } from './prefs';
import type { StoreState } from './state';
import { useStoreSelector } from './store-context';

export function hour24Of(state: StoreState): boolean {
  return prefValueOf(state, PREFS.clockFormat).hour24;
}

export function useHour24(): boolean {
  return useStoreSelector(hour24Of);
}

export function useClockParts(time: string): ClockParts {
  return clockPartsOf(time, useHour24());
}

export function useClockLabel(): (time: string) => string {
  const hour24 = useHour24();
  return (time) => clockLabelOf(time, hour24);
}

export function useClockFormat(): ClockFormat {
  return clockFormatOf(useHour24());
}

export type InstantClock = (moment: Date | string | number, timeZone?: string | null) => string;

export function useInstantClock(): InstantClock {
  const hour24 = useHour24();
  return (moment, timeZone = null) => clockIn(hour24, moment, timeZone);
}
