import { router, type Href } from 'expo-router';
import type { MenuItem } from '../components/menu';

export function settingsItem(target: Href): MenuItem {
  return {
    label: 'Settings',
    icon: 'settings',
    onPress: (): void => {
      router.push(target);
    },
  };
}
