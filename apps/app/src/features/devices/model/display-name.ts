import { displayName } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import { useStoreSelector } from '../../../store/store-context';
import { rowsOf, type StoreState } from '../../../store/state';

const namesIn = memoOnInputs(
  (state) => [state.tables.devices, state.tables.rooms],
  (): Map<string, string> => new Map(),
);

function displayNameIn(state: StoreState, deviceId: string): string | null {
  const device = state.tables.devices.byId[deviceId];
  if (device === undefined) {
    return null;
  }
  const names = namesIn(state);
  const known = names.get(deviceId);
  if (known !== undefined) {
    return known;
  }
  const name = displayName(device, rowsOf(state.tables.devices), rowsOf(state.tables.rooms));
  names.set(deviceId, name);
  return name;
}

export function useDisplayName(deviceId: string): string {
  return useStoreSelector((state) => displayNameIn(state, deviceId) ?? '', Object.is, [deviceId]);
}
