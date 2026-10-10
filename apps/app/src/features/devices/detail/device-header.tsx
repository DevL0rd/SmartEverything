import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';
import { copyText } from '../../../components/copy-button';
import type { MenuItem } from '../../../components/menu';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { notify } from '../../../components/toast-store';
import { href } from '../../../app-shell/hrefs';
import { updateDevice } from '../../../api/devices';
import { joinParts } from '../../../format/text';
import { useDeviceValues, useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useScheduleBelow, useScheduleItems } from '../../automations';
import { usePowerAction } from '../controls/power-toggle';
import { useDisplayName } from '../model/display-name';
import { useDeviceModel } from '../model/device-model';
import { stateLine } from '../model/state-line';
import { settingsItem } from '../../../settings/settings-item';

function useOverflow(device: Device, name: string): readonly MenuItem[] {
  const router = useRouter();
  const model = useDeviceModel(device);
  const health = model.family === 'scale' || model.family === 'wearable';
  const favourite = (): void => {
    updateDevice(device.id, { favourite: !device.favourite }).catch((error: unknown) => {
      notify({
        message: `${name} was not changed`,
        error,
        tone: 'critical',
      });
    });
  };
  return [
    {
      label: device.favourite ? 'Remove from favourites' : 'Add to favourites',
      icon: 'star',
      onPress: favourite,
    },
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

export function useDeviceHeader(device: Device, sectionTitle: string | null): ReactElement {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const name = useDisplayName(device.id);
  const room = useRoomName(device.id);
  const power = usePowerAction(device);
  const overflow = useOverflow(device, name);
  const schedule = useScheduleItems(device.id, power.state);
  const below = useScheduleBelow(device.id);
  const actions: readonly HeaderAction[] =
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
  return (
    <PageHeader
      title={sectionTitle ?? name}
      subtitle={sectionTitle === null ? joinParts([room, stateLine(model, values, false)]) : name}
      actions={sectionTitle === null ? actions : []}
      overflow={sectionTitle === null ? [...schedule, ...overflow] : []}
      {...below}
    />
  );
}
