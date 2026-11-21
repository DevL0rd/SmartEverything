import { computerRoleOfModel } from '@smarteverything/domain';
import type { Store } from '../store/store';

export async function resetComputerPresence(
  store: Pick<Store, 'host'>,
  setOnline: (deviceId: string, online: boolean) => Promise<void>,
): Promise<void> {
  const [active, devices] = await Promise.all([
    store.host.call('computerNodes', 'activeDeviceIds'),
    store.host.call('devices', 'list'),
  ]);
  const paired = new Set(active);
  for (const device of devices) {
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
