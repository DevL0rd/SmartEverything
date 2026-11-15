import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { copyText } from '../../../components/copy-button';
import type { MenuItem } from '../../../components/menu';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import type { StandardShellProps } from '../../../components/page-shell/shell-types';
import { href } from '../../../app-shell/hrefs';
import { joinParts } from '../../../format/text';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useScheduleBelow, useScheduleItems } from '../../automations';
import { usePowerAction } from '../controls/power-toggle';
import { changeDevice } from '../data/change-device';
import { useDisplayName } from '../model/display-name';
import { useDeviceModel } from '../model/device-model';
import { useStateLine } from '../model/state-line';
import { settingsItem } from '../../../settings/settings-item';
import { useHomeMap } from '../../home-map';
import { DeviceBanner } from './device-overview';
import { sectionHref, sectionsOf, type DeviceSection } from './sections';

export interface DeviceShell {
  readonly props: Pick<
    StandardShellProps,
    'title' | 'subtitle' | 'actions' | 'overflow' | 'sections'
  >;
  readonly schedule: ReactNode;
}

function useShowOnMap(deviceId: string): readonly MenuItem[] {
  const router = useRouter();
  const { map } = useHomeMap();
  const placed =
    map?.floors.some((floor) => floor.placements.some((item) => item.deviceId === deviceId)) ===
    true;
  if (!placed) return [];
  return [
    {
      label: 'Show on map',
      icon: 'mapPin',
      onPress: (): void => {
        router.push(href.devicesSelection({ device: deviceId }));
      },
    },
  ];
}

function useOverflow(device: Device, name: string): readonly MenuItem[] {
  const router = useRouter();
  const model = useDeviceModel(device);
  const health = model.family === 'scale' || model.family === 'wearable';
  const showOnMap = useShowOnMap(device.id);
  const favourite = (): void => {
    changeDevice(device, name, { favourite: !device.favourite });
  };
  return [
    {
      label: device.favourite ? 'Remove from favourites' : 'Add to favourites',
      icon: 'star',
      onPress: favourite,
    },
    ...showOnMap,
    ...(health
      ? [
          {
            label: 'Open in Fitness',
            icon: 'fitness' as const,
            onPress: (): void => {
              router.push(href.fitness());
            },
          },
        ]
      : []),
    {
      label: 'Copy name for assistants',
      icon: 'copy',
      onPress: (): void => {
        copyText(name, 'Device name');
      },
    },
    settingsItem(href.settings.device(device.id)),
  ];
}

export function sectionsShellOf(
  device: Device,
  sections: readonly DeviceSection[],
  active: string,
): ShellSections {
  return {
    label: 'Device pages',
    active,
    hrefOf: (key) => (key === 'overview' ? href.device(device) : sectionHref(device.id, key)),
    navigation: 'replace',
    groups: [
      {
        title: null,
        entries: sections.map((section) => ({
          id: section.key,
          label: section.title,
          short: section.key === 'controls' ? 'Controls' : section.title,
          icon: section.icon,
          missing: null,
          detail: null,
        })),
      },
    ],
  };
}

export function useDeviceShell(
  device: Device,
  active: string,
  stateLine: string | null = null,
): DeviceShell {
  const model = useDeviceModel(device);
  const generic = useStateLine(model, false);
  const name = useDisplayName(device.id);
  const room = useRoomName(device.id);
  const power = usePowerAction(device);
  const overflow = useOverflow(device, name);
  const schedule = useScheduleItems(device.id, power.state);
  const below = useScheduleBelow(device.id);
  const actions: readonly ShellAction[] =
    power.state === 'on' || power.state === 'off'
      ? [
          {
            icon: 'power',
            label: power.state === 'on' ? 'Turn off' : 'Turn on',
            selected: power.state === 'on',
            onPress: power.toggle,
          },
        ]
      : [];
  const subtitle = joinParts([room, stateLine ?? generic]);
  return {
    props: {
      title: name,
      ...(subtitle === '' ? {} : { subtitle }),
      actions,
      overflow: [...schedule, ...overflow],
      sections: sectionsShellOf(device, sectionsOf(model), active),
    },
    schedule: below.below,
  };
}

export function DeviceBanners({
  device,
  schedule,
  children,
}: {
  readonly device: Device;
  readonly schedule: ReactNode;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <View className="gap-2">
      {schedule}
      <DeviceBanner device={device} />
      {children}
    </View>
  );
}
