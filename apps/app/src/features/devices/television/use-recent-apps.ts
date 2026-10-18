import { sameJson } from '../../../store/same-json';
import { rowsOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { recentLaunches } from './apps';

export function useRecentApps(deviceId: string): readonly string[] {
  return useStoreSelector(
    (state) => recentLaunches(rowsOf(state.tables.commands), deviceId),
    sameJson,
    [deviceId],
  );
}
