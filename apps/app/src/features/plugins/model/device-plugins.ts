import type { Href } from 'expo-router';
import { deviceFamily, type DeviceFamily } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import type { Device } from '../../../store/state';
import type { SettingDefinition } from '../../../settings/types';

interface DevicePluginEntry {
  readonly id: string;
  readonly addSetting: string;
  readonly families: readonly DeviceFamily[];
}

export const DEVICE_PLUGINS: readonly DevicePluginEntry[] = [
  { id: 'treadmill', addSetting: 'devices.add.treadmill', families: ['treadmill'] },
  { id: 'sonicare', addSetting: 'devices.add.sonicare', families: ['toothbrush'] },
  { id: 'larq', addSetting: 'devices.add.larq', families: ['bottle'] },
  { id: 'scale', addSetting: 'devices.add.bluetooth-scale', families: ['scale'] },
  { id: 'watch', addSetting: 'devices.add.watch', families: ['wearable'] },
];

export interface DevicePluginRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: IconName;
  readonly count: number;
  readonly status: string | null;
  readonly href: Href;
}

function statusOf(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? 'Linked' : `${String(count)} linked`;
}

function targetOf(devices: readonly Device[], setup: Href): Href {
  const [first] = devices;
  if (first === undefined) return setup;
  return devices.length === 1 ? href.settings.device(first.id) : href.settings.page('devices');
}

export function devicePluginRows(
  devices: readonly Device[],
  definitions: readonly SettingDefinition[],
  entries: readonly DevicePluginEntry[] = DEVICE_PLUGINS,
): readonly DevicePluginRow[] {
  return entries.flatMap((entry): DevicePluginRow[] => {
    const definition = definitions.find((setting) => setting.id === entry.addSetting);
    if (definition?.control !== 'link') return [];
    const own = devices.filter((device) => entry.families.includes(deviceFamily(device)));
    return [
      {
        id: entry.id,
        title: definition.title,
        description: definition.description ?? '',
        icon: definition.icon ?? 'puzzle',
        count: own.length,
        status: statusOf(own.length),
        href: targetOf(own, definition.href),
      },
    ];
  });
}
