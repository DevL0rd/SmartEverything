import type { Href } from 'expo-router';
import {
  deviceFamily,
  groupTargets,
  roomLightTargets,
  type SearchPage,
  type SearchSources,
  type TargetEntry,
} from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import { groupControlChoices } from '../features/device-groups';
import { compareText, plural } from '../format/text';
import type { SearchTables, SourceLinks } from './sources';
import { rowsOf, type Device } from '../store/state';

interface GroupPage extends SearchPage {
  readonly to: Href;
  readonly parent: string;
}

type PageLink = (focus?: string) => Href;

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

function isLight(device: Device): boolean {
  return deviceFamily(device) === 'light';
}

function describeMembers(kind: string, noun: string, devices: readonly Device[]): string {
  const offline = devices.filter((device) => !device.online).length;
  const parts = [kind, plural(devices.length, noun)];
  return (offline === 0 ? parts : [...parts, `${String(offline)} offline`]).join(' · ');
}

function controlsFor(
  page: GroupPage,
  link: PageLink,
  devices: readonly Device[],
): readonly GroupPage[] {
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
    to: link(choice.reference),
    parent: `page:${page.path}`,
  }));
}

function namedPages(entry: TargetEntry<Device>): readonly GroupPage[] {
  const { members } = entry;
  const groupId = entry.target.kind === 'group' ? entry.target.groupId : '';
  const lights = members.length > 0 && members.every(isLight);
  const link: PageLink = (focus) => href.group(groupId, { focus });
  const page: GroupPage = {
    path: `device-group:${groupId}`,
    title: entry.name,
    description: lights
      ? describeMembers('Light group', 'light', members)
      : describeMembers('Device group', 'device', members),
    keywords: [...CONTROL_KEYWORDS, 'group', lights ? 'lights' : 'devices', 'edit', 'members'],
    to: link(),
    parent: 'page:device-groups',
  };
  const actions = ['Edit', 'Remove'].map((action) => ({
    ...page,
    path: `${page.path}:${action.toLowerCase()}`,
    title: `${action} ${entry.name}`,
    to: href.group(groupId, { edit: true }),
    parent: `page:${page.path}`,
  }));
  return [page, ...actions, ...controlsFor(page, link, members)];
}

function roomPage(entry: TargetEntry<Device>): readonly GroupPage[] {
  const roomId = entry.target.kind === 'room' ? entry.target.roomId : '';
  const link: PageLink = (focus) => href.roomLights(roomId, { focus });
  const page: GroupPage = {
    path: entry.key,
    title: entry.name,
    description: describeMembers('Room lights', 'light', entry.members),
    keywords: [...CONTROL_KEYWORDS, 'room', 'lights', 'group', 'light group'],
    to: link(),
    parent: 'page:devices',
  };
  return [page, ...controlsFor(page, link, entry.members)];
}

export function deviceGroupPages(tables: SearchTables, out: SourceLinks): SearchSources['pages'] {
  const devices = rowsOf(tables.devices);
  const manager: GroupPage = {
    path: 'device-groups',
    title: 'Device groups',
    description: 'Devices',
    keywords: ['group', 'create', 'new', 'edit', 'remove', 'members'],
    to: href.devices(),
    parent: 'page:devices',
  };
  const create: GroupPage = {
    ...manager,
    path: 'device-groups:new',
    title: 'New device group',
    to: href.newGroup(),
    parent: 'page:device-groups',
  };
  const rooms = roomLightTargets(devices, rowsOf(tables.rooms), compareText);
  return [
    manager,
    create,
    ...groupTargets(devices, rowsOf(tables.deviceGroups)).flatMap(namedPages),
    ...rooms.flatMap(roomPage),
  ].map(({ to, parent, ...page }) => {
    out.links.set(`page:${page.path}`, to);
    out.icons.set(`page:${page.path}`, 'bulb');
    out.parents.set(`page:${page.path}`, parent);
    return page;
  });
}
