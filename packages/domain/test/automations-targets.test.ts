import { describe, expect, it } from 'vitest';
import {
  DEVICE_ROW,
  DeviceTargetError,
  planGroupCommands,
  targetCapability,
  targetDevices,
  type DeviceGroupRow,
  type DeviceRow,
} from '../src';

const ROOM = '7a000000-0000-4000-8000-000000000001';
const OTHER_ROOM = '7a000000-0000-4000-8000-000000000002';
const GROUP = '7a000000-0000-4000-8000-000000000003';

let counter = 0;

function device(overrides: Record<string, unknown>): DeviceRow {
  counter += 1;
  return DEVICE_ROW.parse({
    id: `7d000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`,
    provider: 'xiaomi',
    external_id: `device-${String(counter)}`,
    parent_id: null,
    kind: 'light',
    name: `Device ${String(counter)}`,
    display_name: null,
    model: 'generic.model',
    manufacturer: 'Maker',
    provider_room: null,
    room_id: ROOM,
    online: true,
    capabilities: [
      { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
      {
        key: 'brightness',
        label: 'Brightness',
        access: 'read_write',
        value: { kind: 'number', min: 1, max: 100, step: 1 },
      },
    ],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-08T10:00:00.000Z',
    updated_at: '2026-10-08T10:00:00.000Z',
    ...overrides,
  });
}

const lamp = device({});
const spare = device({});
const hidden = device({ hidden: true });
const elsewhere = device({ room_id: OTHER_ROOM });
const offline = device({ online: false });
const sensor = device({
  kind: 'sensor',
  capabilities: [
    {
      key: 'temperature',
      label: 'Temperature',
      access: 'read',
      value: { kind: 'number', min: -40, max: 80, step: 0.1 },
    },
  ],
});
const purifier = device({
  kind: 'air_purifier',
  model: 'zhimi.airp.vb4',
  capabilities: [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
    {
      key: 'fan_speed',
      label: 'Favourite level',
      access: 'read_write',
      value: { kind: 'number', min: 0, max: 14, step: 1 },
    },
  ],
});
const everyone = [lamp, spare, hidden, elsewhere, offline, sensor, purifier];

const group: DeviceGroupRow = {
  id: GROUP,
  name: 'Mixed',
  device_ids: [lamp.id, elsewhere.id],
  created_at: '2026-10-08T10:00:00.000Z',
  updated_at: '2026-10-08T10:00:00.000Z',
};

const ids = (devices: readonly DeviceRow[]): string[] => devices.map((entry) => entry.id);

describe('C12 choosing the devices of a target', () => {
  it('takes the visible devices of a room, optionally limited to device families', () => {
    expect(ids(targetDevices(everyone, [], { kind: 'room', roomId: ROOM }))).toStrictEqual(
      ids([lamp, spare, offline, sensor, purifier]),
    );
    expect(
      ids(targetDevices(everyone, [], { kind: 'room', roomId: ROOM, families: ['light'] })),
    ).toStrictEqual(ids([lamp, spare, offline]));
  });

  it('takes the members of a named group and an explicit list of devices', () => {
    expect(ids(targetDevices(everyone, [group], { kind: 'group', groupId: GROUP }))).toStrictEqual(
      ids([lamp, elsewhere]),
    );
    expect(
      ids(targetDevices(everyone, [], { kind: 'devices', deviceIds: [spare.id, hidden.id] })),
    ).toStrictEqual(ids([spare, hidden]));
  });

  it('refuses a group that no longer exists', () => {
    expect(() => targetDevices(everyone, [], { kind: 'group', groupId: GROUP })).toThrow(
      DeviceTargetError,
    );
  });
});

describe('C12 turning a change into one command per supporting member', () => {
  it('finds a control by its key or by its presented role', () => {
    expect(targetCapability(purifier, 'fan_speed')?.key).toBe('fan_speed');
    expect(targetCapability(purifier, 'favourite_level')?.key).toBe('fan_speed');
    expect(targetCapability(lamp, 'favourite_level')).toBeUndefined();
  });

  it('commands the members that support the control and skips the rest with a reason', () => {
    const plan = planGroupCommands([lamp, sensor, offline], { capability: 'power', value: true });
    expect(plan.commands).toStrictEqual([{ device_id: lamp.id, capability: 'power', value: true }]);
    expect(plan.skipped).toStrictEqual([
      { deviceId: sensor.id, reason: 'unsupported' },
      { deviceId: offline.id, reason: 'offline' },
    ]);
  });

  it('scales a percentage to each control range', () => {
    const plan = planGroupCommands([purifier, lamp], {
      capability: 'brightness',
      value: 50,
      scale: 'percent',
    });
    expect(plan.commands).toStrictEqual([
      { device_id: lamp.id, capability: 'brightness', value: 50 },
    ]);
    const level = planGroupCommands([purifier], {
      capability: 'favourite_level',
      value: 50,
      scale: 'percent',
    });
    expect(level.commands).toStrictEqual([
      { device_id: purifier.id, capability: 'fan_speed', value: 7 },
    ]);
  });

  it('skips a member whose control refuses the value', () => {
    const plan = planGroupCommands([lamp], { capability: 'brightness', value: 500 });
    expect(plan.commands).toStrictEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]).toMatchObject({ deviceId: lamp.id, reason: 'unsupported' });
    expect(plan.skipped[0]?.detail).toContain('outside');
  });
});
