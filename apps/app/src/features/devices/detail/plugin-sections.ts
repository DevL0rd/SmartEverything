import { APP_PLUGINS } from '../../../plugins/registry';
import type { Device } from '../../../store/state';
import type { DeviceSection } from './sections';

export function pluginSectionsOf(device: Device): DeviceSection[] {
  return APP_PLUGINS.flatMap((plugin) =>
    plugin.deviceSections
      .filter((section) => section.applies(device))
      .map((section) => ({
        key: section.key,
        title: section.title,
        icon: section.icon ?? 'puzzle',
        render: section.render,
      })),
  );
}
