import { rowsOf, type Device } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';

export function deviceOfKind<T extends { readonly kind: string }>(
  devices: readonly T[],
  kind: string,
): T | null {
  return devices.find((device) => device.kind === kind) ?? null;
}

export function usePluginDevice(kind: string): Device | null {
  return useStoreSelector((state) => deviceOfKind(rowsOf(state.tables.devices), kind), Object.is, [
    kind,
  ]);
}
