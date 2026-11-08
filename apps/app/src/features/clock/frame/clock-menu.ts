import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import type { AppHref } from '../../../components/app-href';
import type { MenuItem } from '../../../components/menu';
import { PLANNER_CLOCK_SETTING, PLANNER_SETTINGS_PAGE } from '../../planner/settings';

export function clockSettingsHref(): AppHref {
  return href.settings.focus(PLANNER_SETTINGS_PAGE, PLANNER_CLOCK_SETTING);
}

export function clockMenu(): readonly MenuItem[] {
  const settings = mainPageSettings('clock');
  return [
    {
      id: 'settings',
      label: settings.label,
      icon: 'settings',
      onPress: (): void => {
        router.push(clockSettingsHref());
      },
    },
    {
      id: 'ask-ai',
      label: 'Ask AI',
      icon: 'sparkles',
      onPress: (): void => {
        router.push(href.assistantChat());
      },
    },
  ];
}
