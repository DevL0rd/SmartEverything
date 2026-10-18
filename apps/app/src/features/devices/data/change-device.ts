import { Logger } from '@smarteverything/logging';
import { updateDevice, type DeviceChange } from '../../../api/devices';
import { notifyFailure } from '../../../components/toast-store';
import type { Device } from '../../../store/state';

const log = new Logger('app.devices');

export function changeDevice(device: Pick<Device, 'id'>, name: string, patch: DeviceChange): void {
  const startedAt = Date.now();
  const fields = Object.keys(patch);
  const fail = notifyFailure(`${name} was not changed`);
  updateDevice(device.id, patch).then(
    () => {
      log.info('device.changed', {
        deviceId: device.id,
        fields,
        latencyMs: Date.now() - startedAt,
      });
    },
    (error: unknown) => {
      log.error('device.change_failed', error, {
        deviceId: device.id,
        fields,
        latencyMs: Date.now() - startedAt,
      });
      fail(error);
    },
  );
}
