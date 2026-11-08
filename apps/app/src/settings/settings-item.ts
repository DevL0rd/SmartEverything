import { router } from 'expo-router';
import type { AppHref } from '../components/app-href';
import type { MenuItem } from '../components/menu';

export function settingsItem(target: AppHref): MenuItem {
  return {
    label: 'Settings',
    icon: 'settings',
    onPress: (): void => {
      router.push(target);
    },
  };
}
