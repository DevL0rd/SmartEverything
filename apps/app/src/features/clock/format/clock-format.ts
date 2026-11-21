import { localeClockFormat } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useEffect, useRef, type ReactNode } from 'react';
import { PREFS, prefOf, savePref } from '../../../store/prefs';
import { useSyncStatus } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';

const log = new Logger('app.clock');

function formatMissing(state: StoreState): boolean {
  return state.session !== null && prefOf(state, PREFS.clockFormat).status === 'absent';
}

export function ClockFormatHost(): ReactNode {
  const store = useEntityStore();
  const live = useSyncStatus().status === 'live';
  const missing = useStoreSelector(formatMissing);
  const attempted = useRef(false);
  useEffect(() => {
    if (!live) {
      attempted.current = false;
      return;
    }
    if (!missing || attempted.current) return;
    attempted.current = true;
    const format = localeClockFormat();
    log.info('clock.format_created', { hour24: format.hour24 });
    savePref(store, PREFS.clockFormat, format);
  }, [live, missing, store]);
  return null;
}
