import { DeviceValueIndex } from '../../../store/device-values';
import { describe, expect, it } from 'vitest';
import type { DeviceKind } from '@smarteverything/domain';
import {
  deviceOf,
  emptyState,
  makeTable,
  type Device,
  type StoreState,
} from '../../../store/state';
import { turnOffTargets } from './turn-off';

const ROOM = 'room-1';

function device(id: string, kind: DeviceKind, roomId: string | null, hidden = false): Device {
  return deviceOf({
    id,
    provider: 'xiaomi',
    external_id: id,
    parent_id: null,
    kind,
    name: id,
    display_name: null,
    model: 'test.model',
    manufacturer: 'Test',
    provider_room: null,
    room_id: roomId,
    online: true,
    capabilities: [
      { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
    ],
    details: {},
    hidden,
    favourite: false,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
}

function stateOf(
  devices: readonly Device[],
  powered: Readonly<Record<string, boolean>>,
): StoreState {
  const base = emptyState();
  return {
    ...base,
    tables: {
      ...base.tables,
      devices: makeTable(
        Object.fromEntries(devices.map((row) => [row.id, row])),
        devices.map((row) => row.id),
        1,
      ),
    },
    deviceValues: DeviceValueIndex.from(
      Object.entries(powered).map(([id, on]) => [
        id,
        { power: { value: on, observedAt: '2026-10-16T08:00:00.000Z' } },
      ]),
    ),
  };
}

const LAMP = device('lamp', 'light', ROOM);
const PLUG = device('plug', 'plug', ROOM);
const HIDDEN = device('hidden-lamp', 'light', ROOM, true);
const OTHER_ROOM = device('far-lamp', 'light', 'room-2');
const UNPLACED = device('loose-lamp', 'light', null);
const DEVICES = [LAMP, PLUG, HIDDEN, OTHER_ROOM, UNPLACED];

describe('turning a room off', () => {
  it('targets only the visible lights and plugs of that room that are on', () => {
    const state = stateOf(DEVICES, {
      lamp: true,
      plug: false,
      'hidden-lamp': true,
      'far-lamp': true,
      'loose-lamp': true,
    });
    expect(turnOffTargets(state, ROOM)).toStrictEqual([LAMP]);
  });

  it('has no targets for a room without devices', () => {
    expect(turnOffTargets(stateOf(DEVICES, { lamp: true }), 'room-9')).toStrictEqual([]);
  });

  it('follows power changes of the same devices', () => {
    const before = stateOf(DEVICES, { lamp: true, plug: false });
    const after = {
      ...before,
      deviceValues: stateOf(DEVICES, { lamp: true, plug: true }).deviceValues,
    };
    expect(turnOffTargets(before, ROOM)).toStrictEqual([LAMP]);
    expect(turnOffTargets(after, ROOM)).toStrictEqual([LAMP, PLUG]);
  });
});
