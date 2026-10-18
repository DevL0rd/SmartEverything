import { sleepsBetweenUse } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export function isOffline(device: Device): boolean {
  return !device.online && !sleepsBetweenUse(device);
}

export const OFFLINE_REASON = 'Not reachable. Check its Wi‑Fi.';
