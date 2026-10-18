import { background } from '@smarteverything/logging';
import { recordDeviceRefill } from '../../../api/devices';
import { notifyFailure } from '../../../components/toast-store';

export function sendRefill(deviceId: string): void {
  background(
    recordDeviceRefill(deviceId).then(() => undefined, notifyFailure('The refill didn’t save')),
    'device.refill_failed',
  );
}
