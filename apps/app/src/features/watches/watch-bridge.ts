import { WATCH_BRIDGE, type WatchBridge } from '@smarteverything/domain';
import type { Device } from '../../store/state';

export function bridgeOf(device: Device): WatchBridge | null {
  const parsed = WATCH_BRIDGE.safeParse(device.details['bridge']);
  return parsed.success ? parsed.data : null;
}

export function heldElsewhere(device: Device, clientId: string): WatchBridge | null {
  const bridge = bridgeOf(device);
  return bridge !== null && bridge.clientId !== clientId ? bridge : null;
}
