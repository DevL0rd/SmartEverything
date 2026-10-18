import { describe, expect, it } from 'vitest';
import type { Device } from '../../store/state';
import {
  memberSections,
  missingMembers,
  selectedIn,
  withDevice,
  withSection,
} from './group-members';

const STAMP = '2026-01-01T00:00:00.000Z';
const ROOMS = [
  { id: 'kitchen', name: 'Kitchen', position: 0 },
  { id: 'study', name: 'Study', position: 1 },
];

function deviceOf(id: string, label: string, room: string | null, hidden = false): Device {
  return {
    id,
    provider: 'tuya',
    external_id: id,
    parent_id: null,
    kind: 'light',
    name: label,
    display_name: null,
    model: 'test',
    manufacturer: 'Test',
    provider_room: null,
    room_id: room,
    online: true,
    capabilities: [],
    details: {},
    hidden,
    favourite: false,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
    label,
  };
}

const DEVICES = [
  deviceOf('d1', 'Spot 2', 'kitchen'),
  deviceOf('d2', 'Spot 1', 'kitchen'),
  deviceOf('d3', 'Desk lamp', 'study'),
  deviceOf('d4', 'Spare bulb', null),
  deviceOf('d5', 'Hidden strip', 'study', true),
];
const NO_QUERY = { text: '', hidden: false };

function titles(sections: ReturnType<typeof memberSections>): readonly string[] {
  return sections.map((section) => section.title);
}

describe('memberSections', () => {
  it('groups devices by room in room order, sorted by name, with unplaced devices last', () => {
    const sections = memberSections(DEVICES, ROOMS, [], NO_QUERY);
    expect(titles(sections)).toStrictEqual(['Kitchen', 'Study', 'No room']);
    expect(sections[0]?.devices.map((device) => device.label)).toStrictEqual(['Spot 1', 'Spot 2']);
  });

  it('leaves hidden devices out unless asked for or already in the group', () => {
    const labels = (members: readonly string[], hidden: boolean): readonly string[] =>
      memberSections(DEVICES, ROOMS, members, { text: '', hidden })
        .flatMap((section) => section.devices)
        .map((device) => device.label);
    expect(labels([], false)).not.toContain('Hidden strip');
    expect(labels(['d5'], false)).toContain('Hidden strip');
    expect(labels([], true)).toContain('Hidden strip');
  });

  it('finds devices by name and keeps a whole room when the room name matches', () => {
    const byName = memberSections(DEVICES, ROOMS, [], { text: ' desk ', hidden: false });
    expect(byName.map((section) => section.devices.map((device) => device.id))).toStrictEqual([
      ['d3'],
    ]);
    const byRoom = memberSections(DEVICES, ROOMS, [], { text: 'KITCHEN', hidden: false });
    expect(byRoom[0]?.devices).toHaveLength(2);
  });

  it('returns no sections when nothing matches', () => {
    expect(memberSections(DEVICES, ROOMS, [], { text: 'zzz', hidden: false })).toStrictEqual([]);
  });
});

describe('selecting members', () => {
  const [kitchen] = memberSections(DEVICES, ROOMS, [], NO_QUERY);

  it('counts the selected devices of a room', () => {
    expect(kitchen === undefined ? -1 : selectedIn(['d1', 'd3'], kitchen)).toBe(1);
  });

  it('selects a whole room without duplicating members and clears it again', () => {
    if (kitchen === undefined) throw new Error('kitchen section missing');
    expect(withSection(['d1', 'd3'], kitchen, true)).toStrictEqual(['d1', 'd3', 'd2']);
    expect(withSection(['d1', 'd2', 'd3'], kitchen, false)).toStrictEqual(['d3']);
  });

  it('adds and removes one device', () => {
    expect(withDevice(['d1'], 'd2', true)).toStrictEqual(['d1', 'd2']);
    expect(withDevice(['d1'], 'd1', true)).toStrictEqual(['d1']);
    expect(withDevice(['d1', 'd2'], 'd1', false)).toStrictEqual(['d2']);
  });

  it('lists members whose device no longer exists', () => {
    expect(missingMembers(DEVICES, ['d1', 'gone'])).toStrictEqual(['gone']);
  });
});
