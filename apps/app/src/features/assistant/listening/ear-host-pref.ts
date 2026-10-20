import type { StoreState } from '../../../store/state';

export function earHostOf(state: StoreState): string | null {
  return state.settings?.ear_host_device_id ?? null;
}
