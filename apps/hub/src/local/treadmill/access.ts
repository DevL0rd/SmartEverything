import type { DeviceRow, Starter } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export interface AccessDeps {
  readonly store: Pick<Store, 'host'>;
  readonly holderOf: (device: DeviceRow) => string | null;
}

export function chosenWalkerOf(device: DeviceRow): string | null {
  const chosen = device.details['walkerProfileId'];
  return typeof chosen === 'string' ? chosen : null;
}

export function starterOf(
  deps: AccessDeps,
  device: DeviceRow,
  commandId: string,
): Promise<Starter> {
  return deps.store.host.read('treadmillStarter', {
    commandId,
    holder: deps.holderOf(device),
    chosen: chosenWalkerOf(device),
  });
}
