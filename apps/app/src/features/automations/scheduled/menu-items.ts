import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';
import { cancelScheduled } from './actions';
import { openScheduleSheet } from './quick-sheet';
import { useDeviceSchedule } from './use-scheduled';

export function useScheduleItems(deviceId: string, powerState: string): MenuItem[] {
  const router = useRouter();
  const active = useDeviceSchedule(deviceId);
  const powered = powerState === 'on';
  const quick: MenuItem[] =
    powerState !== 'on' && powerState !== 'off'
      ? []
      : [
          {
            label: powered ? 'Turn off in…' : 'Turn on in…',
            icon: 'timer',
            onPress: (): void => {
              openScheduleSheet(deviceId);
            },
          },
        ];
  const cancel: MenuItem[] =
    active === null
      ? []
      : [
          {
            label: 'Cancel scheduled',
            icon: 'close',
            onPress: (): void => {
              cancelScheduled(active);
            },
          },
        ];
  return [
    ...quick,
    {
      label: 'Schedule…',
      icon: 'calendar',
      onPress: (): void => {
        router.push(href.scheduledNew(deviceId));
      },
    },
    ...cancel,
  ];
}
