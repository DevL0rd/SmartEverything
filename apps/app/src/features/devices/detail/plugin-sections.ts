import { APP_PLUGINS } from '../../../plugins/registry';
import type { PluginDeviceOverview, PluginDeviceSettingsBlock } from '../../../plugins/contract';
import type { Device } from '../../../store/state';
import { inOrder } from './section-order';
import type { DeviceSection } from './sections';

export function pluginSectionsOf(device: Device): readonly DeviceSection[] {
  return inOrder(
    APP_PLUGINS.flatMap((plugin) => plugin.deviceSections).filter((section) =>
      section.applies(device),
    ),
  ).map((section) => ({
    key: section.key,
    title: section.title,
    icon: section.icon ?? 'puzzle',
    scrolls: section.scrolls === true,
    render: section.render,
  }));
}

export function pluginSettingsBlocksOf(device: Device): PluginDeviceSettingsBlock[] {
  return APP_PLUGINS.flatMap((plugin) =>
    plugin.deviceSettings.filter((block) => block.applies(device)),
  );
}

export function pluginOverviewsOf(device: Device): PluginDeviceOverview[] {
  return APP_PLUGINS.flatMap((plugin) =>
    (plugin.deviceOverviews ?? []).filter((overview) => overview.applies(device)),
  );
}
