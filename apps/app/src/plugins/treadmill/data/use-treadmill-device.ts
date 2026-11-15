import { deviceFamily } from '@smarteverything/domain';
import { useFirstDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';

export function isTreadmill(device: Device): boolean {
  return deviceFamily(device) === 'treadmill';
}

export function useTreadmillDevice(): Device | null {
  return useFirstDevice(isTreadmill);
}
