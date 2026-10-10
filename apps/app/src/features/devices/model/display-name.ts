import { displayName } from '@smarteverything/domain';
import { useStoreSelector } from '../../../store/store-context';
import { rowsOf, type StoreState } from '../../../store/state';

function displayNameIn(state: StoreState, deviceId: string): string | null {
  const device = state.tables.devices.byId[deviceId];
  if (device === undefined) {
    return null;
  }
  return displayName(device, rowsOf(state.tables.devices), rowsOf(state.tables.rooms));
}

export function useDisplayName(deviceId: string): string {
  return useStoreSelector((state) => displayNameIn(state, deviceId) ?? '');
}
