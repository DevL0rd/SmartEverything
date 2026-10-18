import { describe, expect, it } from 'vitest';
import type { DeviceGroupRow, DeviceKind, DeviceRow, RoomRow } from '@smarteverything/domain';
import type { PickerState } from '../../components/widget-board';
import { lightGroupSections, lightGroupSuggestions, mixedGroupSections } from './group-picker';

const LIVING = '11111111-1111-4111-8111-111111111111';
const STUDY = '22222222-2222-4222-8222-222222222222';
const STAMP = '2026-01-01T00:00:00.000Z';

function device(id: string, kind: DeviceKind, room: string | null, hidden = false): DeviceRow {
  return {
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
    room_id: room,
    online: true,
    capabilities: [],
    details: {},
    hidden,
    favourite: false,
    position: 0,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function group(id: string, name: string, deviceIds: readonly string[]): DeviceGroupRow {
  return { id, name, device_ids: [...deviceIds], created_at: STAMP, updated_at: STAMP };
}

const ROOMS: readonly RoomRow[] = [
  { id: LIVING, name: 'Living room', position: 0 },
  { id: STUDY, name: 'Study', position: 1 },
];

const STATE: PickerState = {
  rooms: ROOMS,
  devices: [
    device('a', 'light', LIVING),
    device('b', 'light', LIVING),
    device('c', 'light', LIVING, true),
    device('d', 'light', STUDY),
    device('fan', 'fan', STUDY),
  ],
  groups: [
    group('g-lights', 'Downstairs', ['a', 'b']),
    group('g-mixed', 'Study set', ['d', 'fan']),
    group('g-empty', 'Gone', ['missing']),
  ],
};

describe('lightGroupSections', () => {
  it('offers all-light groups and rooms with at least two visible lights', () => {
    const sections = lightGroupSections(STATE, []);
    expect(sections.map((section) => section.title)).toEqual(['Light groups', 'Room lights']);
    expect(sections[0]?.rows.map((row) => [row.key, row.subtitle])).toEqual([
      ['group:g-lights', '2 lights'],
    ]);
    expect(sections[1]?.rows.map((row) => [row.key, row.subtitle])).toEqual([
      [`room-lights:${LIVING}`, '2 lights'],
    ]);
  });

  it('puts the target in the widget options', () => {
    const rows = lightGroupSections(STATE, []).flatMap((section) => section.rows);
    expect(rows.map((row) => row.options)).toEqual([
      { target: { kind: 'group', groupId: 'g-lights' } },
      { target: { kind: 'room', roomId: LIVING, families: ['light'] } },
    ]);
  });

  it('marks targets that are already on the page', () => {
    const placed = [
      {
        key: 'group:g-lights',
        type: 'device-group',
        size: 'XL',
        options: { target: { kind: 'group', groupId: 'g-lights' } },
      },
    ] as const;
    const rows = lightGroupSections(STATE, placed).flatMap((section) => section.rows);
    expect(rows.map((row) => row.note)).toEqual(['On this page', undefined]);
  });

  it('offers nothing when there are no groups and no rooms with lights', () => {
    expect(lightGroupSections({ rooms: [], devices: [], groups: [] }, [])).toEqual([]);
  });
});

describe('lightGroupSuggestions', () => {
  it('suggests the all-light groups', () => {
    expect(lightGroupSuggestions(STATE).map((row) => row.title)).toEqual(['Downstairs']);
  });
});

describe('mixedGroupSections', () => {
  it('offers only the groups that hold something other than lights', () => {
    const sections = mixedGroupSections(STATE, []);
    expect(sections.map((section) => section.title)).toEqual(['Device groups']);
    expect(sections[0]?.rows.map((row) => [row.key, row.subtitle, row.options])).toEqual([
      ['group:g-mixed', '2 devices', { target: { kind: 'group', groupId: 'g-mixed' } }],
    ]);
  });

  it('offers nothing when every group is made of lights', () => {
    expect(
      mixedGroupSections(
        { ...STATE, groups: STATE.groups.filter((candidate) => candidate.id === 'g-lights') },
        [],
      ),
    ).toEqual([]);
  });
});
