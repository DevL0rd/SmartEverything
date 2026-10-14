import { createElement } from 'react';
import { DevicePageLinks } from './page-settings-links';
import { href } from '../../app-shell/hrefs';
import type { SettingDefinition } from '../../settings/types';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'devices.page-links',
    page: 'devices',
    title: 'Device page actions',
    keywords: ['air history', 'filters', 'water', 'maintenance'],
    scope: 'client',
    control: 'custom',
    render: () => createElement(DevicePageLinks),
  },
  {
    id: 'devices.air-history',
    page: 'devices',
    title: 'Air history',
    keywords: ['air quality', 'pm25', 'temperature', 'humidity', 'chart'],
    scope: 'client',
    control: 'listed',
    in: 'devices.page-links',
    visible: (env) => env.availability.hasClimate,
  },
  {
    id: 'devices.supplies',
    page: 'devices',
    title: 'Filters & water',
    keywords: ['filter', 'water', 'tank', 'maintenance', 'supplies'],
    scope: 'client',
    control: 'listed',
    in: 'devices.page-links',
    visible: (env) => env.availability.hasClimate,
  },
  {
    id: 'devices.rooms',
    page: 'devices',
    title: 'Rooms',
    icon: 'grid',
    keywords: ['room', 'areas', 'rename'],
    scope: 'server',
    control: 'link',
    href: href.settings.page('home/rooms'),
  },
  {
    id: 'devices.add.bluetooth-scale',
    page: 'devices/add',
    section: 'Bluetooth',
    title: 'Bluetooth scale',
    description: 'Weigh-ins go to whoever steps on',
    icon: 'scale',
    keywords: ['scale', 'weight', 'bluetooth', 'body'],
    scope: 'server',
    control: 'link',
    href: href.connect('scale'),
  },
];
