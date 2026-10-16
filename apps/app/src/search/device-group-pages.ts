import type { Href } from 'expo-router';
import { deviceFamily, type SearchPage, type SearchSources } from '@smarteverything/domain';
import { groupControlChoices } from '../features/device-groups';
import type { SearchTables, SourceLinks } from './sources';
import { rowsOf, type Device } from '../store/state';

interface GroupPage extends SearchPage {
  readonly to: Href;
  readonly parent: string;
}
const CONTROL_KEYWORDS = [
  'all',
  'brightness',
  'colour',
  'color',
  'temperature',
  'power',
  'on',
  'off',
];

function controlsFor(page: GroupPage, devices: readonly Device[]): readonly GroupPage[] {
  return groupControlChoices(devices).map((choice) => ({
    path: `${page.path}:${choice.reference}`,
    title: choice.presented.label,
    description: page.title,
    keywords: [
      ...CONTROL_KEYWORDS,
      page.title,
      choice.reference,
      ...choice.presented.options.map((option) => option.label),
    ],
    to: page.to,
    parent: `page:${page.path}`,
  }));
}

function namedPages(tables: SearchTables): readonly GroupPage[] {
  const devices = rowsOf(tables.devices);
  return rowsOf(tables.deviceGroups).flatMap((group) => {
    const page: GroupPage = {
      path: `device-group:${group.id}`,
      title: group.name,
      description: 'Device groups',
      keywords: [...CONTROL_KEYWORDS, 'group', 'devices', 'edit', 'members'],
      to: { pathname: '/devices', params: { groups: group.id } },
      parent: 'page:device-groups',
    };
    const actions = ['Edit', 'Remove'].map((action) => ({
      ...page,
      path: `${page.path}:${action.toLowerCase()}`,
      title: `${action} ${group.name}`,
      parent: `page:${page.path}`,
    }));
    return [
      page,
      ...actions,
      ...controlsFor(
        page,
        devices.filter((device) => group.device_ids.includes(device.id)),
      ),
    ];
  });
}

function roomPages(tables: SearchTables): readonly GroupPage[] {
  const devices = rowsOf(tables.devices).filter(
    (device) => !device.hidden && deviceFamily(device) === 'light',
  );
  const rooms = [...rowsOf(tables.rooms), { id: 'none', name: 'No room' }];
  return rooms.flatMap((room) => {
    const members = devices.filter(
      (device) => device.room_id === (room.id === 'none' ? null : room.id),
    );
    if (members.length === 0) return [];
    const page: GroupPage = {
      path: `room-lights:${room.id}`,
      title: `${room.name} lights`,
      description: 'Devices',
      keywords: [...CONTROL_KEYWORDS, 'room', 'lights', 'group'],
      to: { pathname: '/devices', params: { room: room.id } },
      parent: 'page:devices',
    };
    return [page, ...controlsFor(page, members)];
  });
}

export function deviceGroupPages(tables: SearchTables, out: SourceLinks): SearchSources['pages'] {
  const manager: GroupPage = {
    path: 'device-groups',
    title: 'Device groups',
    description: 'Devices',
    keywords: ['group', 'create', 'new', 'edit', 'remove', 'members'],
    to: { pathname: '/devices', params: { groups: 'all' } },
    parent: 'page:devices',
  };
  const create: GroupPage = {
    ...manager,
    path: 'device-groups:new',
    title: 'New device group',
    to: { pathname: '/devices', params: { groups: 'new' } },
    parent: 'page:device-groups',
  };
  return [manager, create, ...namedPages(tables), ...roomPages(tables)].map(
    ({ to, parent, ...page }) => {
      out.links.set(`page:${page.path}`, to);
      out.icons.set(`page:${page.path}`, 'bulb');
      out.parents.set(`page:${page.path}`, parent);
      return page;
    },
  );
}
