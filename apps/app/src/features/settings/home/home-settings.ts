import { deviceTimeZone } from '../../../platform/time-zone';
import { createElement } from 'react';
import { updateHome } from '../../../api/settings';
import type { SettingDefinition } from '../../../settings/types';
import { LocationCard } from './location-card';
import { DeviceTimeZoneRow, TimeZoneRow } from './location-rows';
import { RoomsBlock } from './rooms-block';

const owner = (env: { readonly owner: boolean }): boolean => env.owner;

export const HOME_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'home.name',
    page: 'home',
    title: 'Name',
    icon: 'pencil',
    keywords: ['home name', 'rename home', 'house'],
    scope: 'server',
    control: 'text',
    placeholder: 'Home name',
    maxLength: 80,
    visible: owner,
    read: (state) => state.settings?.home_name ?? '',
    write: (home_name) => updateHome({ home_name }),
  },
  {
    id: 'home.location',
    page: 'home/location',
    section: 'Location',
    title: 'Location',
    keywords: [
      'location',
      'where',
      'city',
      'town',
      'place',
      'address',
      'weather',
      'sunrise',
      'sunset',
    ],
    scope: 'server',
    control: 'custom',
    render: () => createElement(LocationCard),
  },
  {
    id: 'home.time_zone',
    page: 'home/location',
    section: 'Time',
    title: 'Time zone',
    keywords: ['time zone', 'timezone', 'clock'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(TimeZoneRow),
  },
  {
    id: 'home.device_time_zone',
    page: 'home/location',
    section: 'Time',
    title: "Use this device's time zone",
    keywords: ['time zone'],
    scope: 'server',
    control: 'custom',
    row: true,
    visible: owner,
    when: (state) => state.settings?.time_zone !== deviceTimeZone(),
    render: () => createElement(DeviceTimeZoneRow),
  },
  {
    id: 'home.rooms',
    page: 'home/rooms',
    title: 'Rooms',
    keywords: ['room', 'add room', 'rename room', 'reorder rooms', 'delete room'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(RoomsBlock),
  },
];
