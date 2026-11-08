import { computerRoleOfModel } from '@smarteverything/domain';
import type { Store } from '../store/store';

export async function resetComputerPresence(
  store: Pick<Store, 'devices' | 'computerNodes'>,
  setOnline: (deviceId: string, online: boolean) => Promise<void>,
): Promise<void> {
  const paired = new Set(store.computerNodes.activeDeviceIds());
  for (const device of store.devices.list()) {
    if (
      device.provider === 'local' &&
      device.kind === 'computer' &&
      computerRoleOfModel(device.model) === 'pc' &&
      device.online &&
      paired.has(device.id)
    ) {
      await setOnline(device.id, false);
    }
  }
}
