import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { background } from '@smarteverything/logging';
import type { LayoutRow } from '@smarteverything/domain';
import { useEntityStore } from '../store/store-context';
import type { StoreState } from '../store/state';
import { startPerf } from '../perf/install';
import { applyFlags, flagsRow } from './boot';
import { deviceRow, personRow } from './panel';
import { applyWatchCapture } from './watch-capture';

const WATCHED = ['tables.layouts', 'session'];

function watchedRows(state: StoreState): readonly (LayoutRow | null)[] {
  return [flagsRow(state), deviceRow(state), personRow(state)];
}

export function DeveloperSyncHost(): ReactNode {
  const store = useEntityStore();
  useEffect(() => {
    let capture: boolean | null = null;
    let previous: ReturnType<typeof watchedRows> | null = null;
    const rerun = (): void => {
      const state = store.get();
      const rows = watchedRows(state);
      const last = previous;
      if (last !== null && rows.every((row, index) => row === last[index])) return;
      previous = rows;
      const wanted = applyFlags(state)['watch.capture'];
      startPerf();
      if (wanted !== capture) {
        capture = wanted;
        background(applyWatchCapture(wanted), 'developer.watch_capture_failed', { wanted });
      }
    };
    rerun();
    const stop = store.subscribeSlices(WATCHED, rerun);
    return (): void => {
      stop();
    };
  }, [store]);
  return null;
}
