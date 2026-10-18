import type { IconName } from '../components/icon';
import { computerPages } from '../features/computers';
import { phonePages } from '../features/phone';
import type { PluginDevicePage } from '../plugins/contract';
import { APP_PLUGINS } from '../plugins/registry';
import type { Device } from '../store/state';

export interface DevicePageContribution {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
  readonly settings: readonly string[];
}

export function pluginDevicePages(device: Device): readonly PluginDevicePage[] {
  return APP_PLUGINS.flatMap((plugin) => plugin.devicePages?.pages ?? []).filter((page) =>
    page.applies(device),
  );
}

export function pluginDevicePage(device: Device, id: string): PluginDevicePage | undefined {
  return pluginDevicePages(device).find((page) => page.id === id);
}

export function contributedDevicePages(device: Device): readonly DevicePageContribution[] {
  return [...computerPages(device), ...phonePages(device), ...pluginDevicePages(device)];
}
