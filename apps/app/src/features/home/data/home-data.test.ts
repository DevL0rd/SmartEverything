import { describe, expect, it, vi } from 'vitest';
import type { BoardWidget } from '@smarteverything/domain';
import { addable, isShown } from '../../../components/widget-board/edit/edit-model';
import { galleryItems } from '../../../components/widget-board/edit/gallery-model';
import type { PickerState } from '../../../components/widget-board';
import { deviceFixture } from '../../../store/device-fixture';
import { DEVICE_GROUP_WIDGET } from '../../device-groups';
import { SPOTLIGHT_WIDGET } from '../widgets/spotlight';
import { NO_HOME_DATA, availableWidgets } from './home-data';

vi.mock('../../talk/data/talk-available', () => ({ talkAvailable: () => true }));

describe('Home widget availability', () => {
  it('offers both Walkie-talkie widgets on supported clients before any channels exist', () => {
    expect([...availableWidgets(NO_HOME_DATA)]).toEqual([
      'device-group',
      'talk-channel',
      'talk-channels',
    ]);
  });

  it('makes the Phone widget available when its phone exists', () => {
    const available = availableWidgets({ ...NO_HOME_DATA, phone: true });
    expect(available.has('phone')).toBe(true);
  });

  it('makes the Workout widget available with the other linked watch widgets', () => {
    const available = availableWidgets({ ...NO_HOME_DATA, watch: true });
    expect(available.has('watch')).toBe(true);
    expect(available.has('stress')).toBe(true);
    expect(available.has('watch-workout')).toBe(true);
  });
});

const ROOM = { id: '11111111-1111-4111-8111-111111111111', name: 'Study', position: 0 };
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const MISSING_GROUP_ID = '33333333-3333-4333-8333-333333333333';
const STAMP = '2026-01-01T00:00:00.000Z';

const LAMP = deviceFixture(1, { id: '41111111-1111-4111-8111-111111111111', room_id: ROOM.id });
const CEILING = deviceFixture(6, { id: '41111111-1111-4111-8111-222222222222', room_id: ROOM.id });
const PLUG = deviceFixture(0, { id: '41111111-1111-4111-8111-333333333333', room_id: null });

const EMPTY_GROUP = {
  id: GROUP_ID,
  name: 'Study set',
  device_ids: [MISSING_GROUP_ID],
  created_at: STAMP,
  updated_at: STAMP,
};
const MIXED_GROUP = { ...EMPTY_GROUP, device_ids: [LAMP.id, PLUG.id] };

const SAVED_GROUPS: readonly BoardWidget[] = [
  {
    key: 'room',
    type: 'device-group',
    size: 'XL',
    options: { target: { kind: 'room', roomId: ROOM.id, families: ['light'] } },
  },
  {
    key: 'devices',
    type: 'device-group',
    size: 'XL',
    options: { target: { kind: 'devices', deviceIds: [LAMP.id] } },
  },
  {
    key: 'empty',
    type: 'device-group',
    size: 'XL',
    options: { target: { kind: 'group', groupId: GROUP_ID } },
  },
  {
    key: 'removed',
    type: 'device-group',
    size: 'XL',
    options: { target: { kind: 'group', groupId: MISSING_GROUP_ID } },
  },
];

describe('Home group placements and gallery offers', () => {
  const availability = {
    types: availableWidgets(NO_HOME_DATA),
    instance: undefined,
  };

  it('keeps saved group widgets visible even when there is nothing to pick', () => {
    const state = { devices: [LAMP], rooms: [ROOM], groups: [EMPTY_GROUP] };
    const definitions = addable([DEVICE_GROUP_WIDGET], availability, 'compact');
    expect(SAVED_GROUPS.filter((widget) => isShown(widget, availability))).toEqual(SAVED_GROUPS);
    expect(galleryItems(definitions, SAVED_GROUPS, 'compact', state)).toEqual([]);
  });

  const cases: readonly {
    readonly name: string;
    readonly state: PickerState;
    readonly titles: readonly string[];
  }[] = [
    {
      name: 'a room with two visible lights',
      state: { devices: [LAMP, CEILING], rooms: [ROOM], groups: [] },
      titles: ['Light group', 'Light'],
    },
    {
      name: 'a mixed named group',
      state: { devices: [LAMP, PLUG], rooms: [ROOM], groups: [MIXED_GROUP] },
      titles: ['Device group', 'Light', 'Device'],
    },
    {
      name: 'both group targets and both spotlight targets',
      state: { devices: [LAMP, CEILING, PLUG], rooms: [ROOM], groups: [MIXED_GROUP] },
      titles: ['Light group', 'Device group', 'Light', 'Device'],
    },
  ];

  it.each(cases)(
    'keeps valid, repeatable offers in catalogue order with $name',
    ({ state, titles }) => {
      const entries = galleryItems(
        [DEVICE_GROUP_WIDGET, SPOTLIGHT_WIDGET],
        SAVED_GROUPS,
        'compact',
        state,
      );
      expect(entries.map((item) => item.entry.title)).toEqual(titles);
    },
  );
});
