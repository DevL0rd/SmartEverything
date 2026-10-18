import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';
import type { Device } from '../../../store/state';
import { usePhoneAction } from '../data/phone-action';

export function usePhoneMenu(device: Device, onOpenLink: () => void): readonly MenuItem[] {
  const router = useRouter();
  const run = usePhoneAction(device);
  return [
    {
      label: 'Refresh now',
      icon: 'refresh',
      onPress: (): void => {
        run({ type: 'refresh' });
      },
    },
    { label: 'Open a link on the phone', icon: 'externalLink', onPress: onOpenLink },
    {
      label: 'Phone settings',
      icon: 'smartphone',
      onPress: (): void => {
        router.push(href.settings.device(device.id, 'setup'));
      },
    },
    {
      label: 'Rename or remove',
      icon: 'settings',
      onPress: (): void => {
        router.push(href.settings.device(device.id));
      },
    },
    {
      label: 'Listening settings',
      icon: 'mic',
      onPress: (): void => {
        router.push(href.settings.page('assistant/listening'));
      },
    },
  ];
}
