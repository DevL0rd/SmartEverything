import { useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';

export function displayNameOf(state: StoreState, deviceId: string): string {
  return state.tables.devices.byId[deviceId]?.label ?? '';
}

export function useDisplayName(deviceId: string): string {
  return useStoreSelector((state) => displayNameOf(state, deviceId), Object.is, [deviceId]);
}
