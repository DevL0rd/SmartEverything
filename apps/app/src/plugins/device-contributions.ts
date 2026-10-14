import type { Device } from '../store/state';
import { APP_PLUGINS } from './registry';
import type { PluginDeviceCard } from './contract';

export function deviceCardOf(device: Device): PluginDeviceCard | undefined {
  return APP_PLUGINS.flatMap((plugin) => plugin.deviceCards ?? []).find((card) =>
    card.applies(device),
  );
}

export function isDirectoryChild(device: Device): boolean {
  return device.parent_id !== null && deviceCardOf(device)?.groupChildren === true;
}
