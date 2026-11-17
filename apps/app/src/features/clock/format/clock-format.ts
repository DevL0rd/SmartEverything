import { localeClockFormat } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useEffect, type ReactNode } from 'react';
import {
  clockFormatOf,
  clockLabelOf,
  clockPartsOf,
  type ClockFormat,
  type ClockParts,
} from '../../../format/clock-text';
import { clockIn } from '../../../format/time';
import { useHour24 } from '../../../store/clock-format';
import { PREFS, prefOf, savePref } from '../../../store/prefs';
import { useSyncStatus } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';

const log = new Logger('app.clock');

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

function formatMissing(state: StoreState): boolean {
  return state.session !== null && prefOf(state, PREFS.clockFormat).status === 'absent';
}

export function ClockFormatHost(): ReactNode {
  const store = useEntityStore();
  const live = useSyncStatus().status === 'live';
  const missing = useStoreSelector(formatMissing);
  useEffect(() => {
    if (!live || !missing) return;
    const format = localeClockFormat();
    log.info('clock.format_created', { hour24: format.hour24 });
    savePref(store, PREFS.clockFormat, format);
  }, [live, missing, store]);
  return null;
}
