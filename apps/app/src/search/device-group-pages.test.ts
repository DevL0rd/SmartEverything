import { describe, expect, it } from 'vitest';
import type { DeviceGroupRow } from '@smarteverything/domain';
import { emptyState, makeTable, type Device } from '../store/state';
import { deviceGroupPages } from './device-group-pages';
import type { SearchTables, SourceLinks } from './sources';

const STAMP = '2026-01-01T00:00:00.000Z';

function deviceOf(id: string, kind: Device['kind'], online: boolean, roomId: string): Device {
  return {
    id,
    provider: 'tuya',
    external_id: id,
    parent_id: null,
    kind,
    name: id,
    display_name: null,
    model: 'test',
    manufacturer: 'Test',
    provider_room: null,
    room_id: roomId,
    online,
    capabilities: [
      { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
    ],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
    label: id,
  };
}

function groupOf(id: string, name: string, deviceIds: readonly string[]): DeviceGroupRow {
  return { id, name, device_ids: [...deviceIds], created_at: STAMP, updated_at: STAMP };
}

function tablesOf(devices: readonly Device[], groups: readonly DeviceGroupRow[]): SearchTables {
  const { tables } = emptyState();
  return {
    chats: [],
    devices: makeTable(
      Object.fromEntries(devices.map((device) => [device.id, device])),
      devices.map((device) => device.id),
      1,
    ),
    rooms: makeTable({ r1: { id: 'r1', name: 'Room 3', position: 0 } }, ['r1'], 1),
    deviceGroups: makeTable(
      Object.fromEntries(groups.map((group) => [group.id, group])),
      groups.map((group) => group.id),
      1,
    ),
    scenes: tables.scenes,
    automations: tables.automations,
    scheduled: tables.scheduled_actions,
    plugins: tables.plugins,
    pluginStreams: tables.plugin_streams,
    pluginUi: tables.plugin_ui,
    extensions: undefined,
    configuration: undefined,
    inventory: undefined,
  };
}

function linksOf(): SourceLinks {
  return { links: new Map(), icons: new Map(), parents: new Map(), plugins: new Set() };
}

function descriptionOf(
  pages: ReturnType<typeof deviceGroupPages>,
  path: string,
): string | undefined {
  return pages.find((page) => page.path === path)?.description;
}

describe('deviceGroupPages', () => {
  const devices = [
    deviceOf('a', 'light', true, 'r1'),
    deviceOf('b', 'light', false, 'r1'),
    deviceOf('c', 'fan', true, 'r1'),
  ];
  const groups = [groupOf('g1', 'Lamps', ['a', 'b']), groupOf('g2', 'Mixed', ['a', 'c'])];
  const pages = deviceGroupPages(tablesOf(devices, groups), linksOf());

  it('describes a group made only of lights as a light group with its member count and offline lights', () => {
    expect(descriptionOf(pages, 'device-group:g1')).toBe('Light group · 2 lights · 1 offline');
  });

  it('describes a group with other devices as a device group', () => {
    expect(descriptionOf(pages, 'device-group:g2')).toBe('Device group · 2 devices');
  });

  it('describes the lights of a room as room lights', () => {
    expect(descriptionOf(pages, 'room-lights:r1')).toBe('Room lights · 2 lights · 1 offline');
  });

  it('lists room lights only for rooms with two or more visible lights', () => {
    const single = [deviceOf('a', 'light', true, 'r1'), deviceOf('c', 'fan', true, 'r1')];
    const paths = deviceGroupPages(tablesOf(single, []), linksOf()).map((page) => page.path);
    expect(paths.filter((path) => path.startsWith('room-lights:'))).toStrictEqual([]);
  });

  it('nests the group edit and remove actions under the group hit', () => {
    const out = linksOf();
    deviceGroupPages(tablesOf(devices, groups), out);
    expect(out.parents.get('page:device-group:g1:edit')).toBe('page:device-group:g1');
    expect(out.parents.get('page:device-group:g1')).toBe('page:device-groups');
  });

  it('opens the group page from the group and its editor from the edit and remove actions', () => {
    const out = linksOf();
    deviceGroupPages(tablesOf(devices, groups), out);
    const editor = { pathname: '/groups/[groupId]', params: { groupId: 'g1', edit: '1' } };
    expect(out.links.get('page:device-group:g1:edit')).toStrictEqual(editor);
    expect(out.links.get('page:device-group:g1:remove')).toStrictEqual(editor);
    expect(out.links.get('page:device-group:g1')).toStrictEqual({
      pathname: '/groups/[groupId]',
      params: { groupId: 'g1' },
    });
  });

  it('opens the room lights page from the room lights hit', () => {
    const out = linksOf();
    deviceGroupPages(tablesOf(devices, groups), out);
    expect(out.links.get('page:room-lights:r1')).toStrictEqual({
      pathname: '/rooms/[roomId]/lights',
      params: { roomId: 'r1' },
    });
  });

  it('focuses the shared control on the page when a nested control hit is chosen', () => {
    const out = linksOf();
    deviceGroupPages(tablesOf(devices, groups), out);
    const nested = [...out.links].filter(([path]) => path.startsWith('page:device-group:g1:power'));
    expect(nested.map(([, link]) => link)).toStrictEqual([
      { pathname: '/groups/[groupId]', params: { groupId: 'g1', focus: 'power' } },
    ]);
  });

  it('opens the new group page from the new group entry', () => {
    const out = linksOf();
    deviceGroupPages(tablesOf(devices, groups), out);
    expect(out.links.get('page:device-groups:new')).toBe('/groups/new');
  });
});
