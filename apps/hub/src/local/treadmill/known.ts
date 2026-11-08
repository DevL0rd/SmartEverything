import type { DeviceRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { TREADMILL_DRIVER } from './config';

export function treadmillOf(
  store: Pick<Store, 'devices' | 'localDevices'>,
  deviceId: string,
): DeviceRow | null {
  const device = store.devices.find(deviceId);
  const known =
    device !== undefined &&
    store.localDevices
      .list()
      .some(
        (entry) => entry.externalId === device.external_id && entry.driver === TREADMILL_DRIVER,
      );
  return known ? device : null;
}
