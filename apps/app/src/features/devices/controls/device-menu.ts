import { href } from '../../../app-shell/hrefs';
import { updateDevice } from '../../../api/devices';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import type { Device } from '../../../store/state';
import { openQuickControls } from '../../../store/ui-state';
import { useScheduleItems } from '../../automations';
import { usePowerAction } from './power-toggle';
import { settingsItem } from '../../../settings/settings-item';

function usePowerItem(device: Device): readonly MenuItem[] {
  const power = usePowerAction(device);
  if (power.state !== 'on' && power.state !== 'off') {
    return [];
  }
  return [
    {
      label: power.state === 'on' ? 'Turn off' : 'Turn on',
      icon: 'power',
      onPress: power.toggle,
    },
  ];
}

export function useDeviceMenu(
  device: Device,
  options: { readonly quickControls: boolean },
): readonly MenuItem[] {
  const power = usePowerItem(device);
  const state = usePowerAction(device).state;
  const schedule = useScheduleItems(device.id, state);
  const toggleFavourite = (): void => {
    updateDevice(device.id, { favourite: !device.favourite }).catch((error: unknown) => {
      notify({ message: `${device.label} was not changed`, error, tone: 'critical' });
    });
  };
  const quick: readonly MenuItem[] = options.quickControls
    ? [
        {
          label: 'Quick controls',
          icon: 'sparkles',
          onPress: (): void => {
            openQuickControls(device.id);
          },
        },
      ]
    : [];
  return [
    ...power,
    ...quick,
    ...schedule,
    {
      label: device.favourite ? 'Remove from favourites' : 'Add to favourites',
      icon: 'star',
      onPress: toggleFavourite,
    },
    settingsItem(href.settings.device(device.id)),
  ];
}
