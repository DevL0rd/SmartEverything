import { deviceFamily } from '@smarteverything/domain';
import { useDevices } from '../../../store/selectors';
import type { Device } from '../../../store/state';

export function isTreadmill(device: Device): boolean {
  return deviceFamily(device) === 'treadmill';
}

export function useTreadmillDevice(): Device | null {
  return useDevices().find(isTreadmill) ?? null;
}
