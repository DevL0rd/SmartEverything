import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';
import { canMove, type WorldCity, type WorldClock } from './cities';

export interface CityMenuActions {
  readonly move: (zone: string, by: -1 | 1) => void;
  readonly remove: (zone: string) => void;
}

const HOME_MENU: readonly MenuItem[] = [
  {
    id: 'home-location',
    label: 'Change home location',
    icon: 'home',
    onPress: (): void => {
      router.push(href.settings.page('home/location'));
    },
  },
];

export function cityMenuOf(
  city: WorldCity,
  clocks: readonly WorldClock[],
  offline: boolean,
  actions: CityMenuActions,
): readonly MenuItem[] {
  if (city.home) return HOME_MENU;
  return [
    {
      id: 'earlier',
      label: 'Move earlier',
      icon: 'arrowUp',
      disabled: offline || !canMove(clocks, city.zone, -1),
      onPress: (): void => {
        actions.move(city.zone, -1);
      },
    },
    {
      id: 'later',
      label: 'Move later',
      icon: 'arrowDown',
      disabled: offline || !canMove(clocks, city.zone, 1),
      onPress: (): void => {
        actions.move(city.zone, 1);
      },
    },
    {
      id: 'remove',
      label: 'Remove',
      icon: 'trash',
      destructive: true,
      disabled: offline,
      onPress: (): void => {
        actions.remove(city.zone);
      },
    },
  ];
}
