import { deviceFamily } from '@smarteverything/domain';
import { useFirstDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';

export function isToothbrush(device: Device): boolean {
  return deviceFamily(device) === 'toothbrush';
}

export function useBrushDevice(): Device | null {
  return useFirstDevice(isToothbrush);
}
