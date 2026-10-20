import { describe, expect, it } from 'vitest';
import type { NamedDevice } from '@smarteverything/domain';
import { deviceGroups } from './device-groups';

type TestDevice = NamedDevice & { readonly hidden: boolean };

function device(id: string, name: string, hidden: boolean, roomId: string | null): TestDevice {
  return {
    id,
    name,
    display_name: null,
    room_id: roomId,
    hidden,
    kind: 'light',
    model: 'model',
  };
}

const rooms = [
  { id: 'r2', name: 'Kitchen' },
  { id: 'r1', name: 'Bedroom' },
];

describe('the devices listed in Device settings', () => {
  it('lists visible and hidden devices together', () => {
    const groups = deviceGroups(
      [device('a', 'Lamp', false, 'r1'), device('b', 'Heater', true, 'r1')],
      rooms,
    );
    expect(groups.map((group) => group.devices.map((entry) => entry.device.id))).toEqual([
      ['b', 'a'],
    ]);
  });

  it('lists visible devices when none is hidden', () => {
    const groups = deviceGroups([device('a', 'Lamp', false, null)], rooms);
    expect(groups.map((group) => group.id)).toEqual(['no-room']);
  });

  it('is empty when there are no devices', () => {
    expect(deviceGroups([], rooms)).toEqual([]);
  });

  it('orders rooms by name and puts unplaced devices last', () => {
    const groups = deviceGroups(
      [
        device('a', 'Lamp', false, null),
        device('b', 'Oven', false, 'r2'),
        device('c', 'Bed light', true, 'r1'),
        device('d', 'Orphan', false, 'gone'),
      ],
      rooms,
    );
    expect(groups.map((group) => group.title)).toEqual(['Bedroom', 'Kitchen', 'No room']);
    expect(groups[2]?.devices.map((entry) => entry.device.id)).toEqual(['a', 'd']);
  });

  it('sorts numbered names naturally and handles many devices', () => {
    const many = Array.from({ length: 300 }, (_, index) =>
      device(String(index), `Light ${String(300 - index)}`, index % 2 === 0, 'r1'),
    );
    const [group] = deviceGroups(many, rooms);
    expect(group?.devices).toHaveLength(300);
    expect(group?.devices.slice(0, 3).map((entry) => entry.name)).toEqual([
      'Light 1',
      'Light 2',
      'Light 3',
    ]);
  });
});
