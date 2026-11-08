import { href } from '../app-shell/hrefs';
import { HOME_MAPS_PATH } from '../features/home-map/settings';
import { HOME_LAYOUT_PAGES } from './tree-home-layouts';
import type { SettingsPageDefinition } from './types';

const HOME_MAP_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'home/map',
    title: 'Home maps',
    subtitle: 'Your maps, the robot maps that feed them and how every map looks',
    icon: 'plan',
    parent: 'home',
    group: null,
    href: href.settings.page(HOME_MAPS_PATH),
    keywords: [
      'home maps',
      'home map',
      'maps',
      'robot maps',
      'default map',
      'map',
      'floor plan',
      'layout',
      'house map',
      'blueprint',
      'furniture',
      'decorate',
      'lights',
      'walls',
      '3d',
    ],
  },
];

export const HOME_SUB_PAGES: readonly SettingsPageDefinition[] = [
  ...HOME_LAYOUT_PAGES,
  ...HOME_MAP_PAGES,
];
