import { describe, expect, it } from 'vitest';
import { HOME_MAP_WRITE, type HomeMap } from '@smarteverything/domain';
import { deviceFixture } from '../../../../store/device-fixture';
import {
  pickerSections,
  placeableIds,
  waitingCount,
  type PickerQuery,
} from './device-picker-model';

const FLOOR = '00000000-0000-4000-8000-0000000000f1';
const HALL = '00000000-0000-4000-8000-0000000000b1';
const KITCHEN = '00000000-0000-4000-8000-0000000000b2';
const LAMP = '00000000-0000-4000-8000-0000000000a1';
const FAN = '00000000-0000-4000-8000-0000000000a2';
const KETTLE = '00000000-0000-4000-8000-0000000000a3';
const SPEAKER = '00000000-0000-4000-8000-0000000000a4';
const CHILD = '00000000-0000-4000-8000-0000000000a5';
const LOST = '00000000-0000-4000-8000-0000000000a6';

const map: HomeMap = HOME_MAP_WRITE.parse({
  ...{ schemaVersion: 1, id: 'home', name: 'Test house', revision: 1, north: 0 },
  updatedAt: '2026-10-25T00:00:00.000Z',
  floors: [
    {
      ...{ id: FLOOR, name: 'Ground', level: 0, elevation: 0, ceilingHeight: 2.6 },
      rooms: [
        {
          ...{ id: 'map-hall', name: null, homeRoomId: HALL },
          polygon: {
            outer: [
              { x: 0, y: 0 },
              { x: 4, y: 0 },
              { x: 4, y: 3 },
              { x: 0, y: 3 },
            ],
            holes: [],
          },
          ...{ labelAt: { x: 2, y: 1.5 }, colourSlot: 1, wallPaint: null, ceilingHeight: null },
          ...{
            floorMaterial: { kind: 'plain', variant: null, tint: null },
            origin: { kind: 'hand' },
          },
        },
      ],
      walls: [],
      openings: [],
      objects: [],
      placements: [
        {
          ...{ deviceId: LAMP, floorId: FLOOR, at: { x: 1, y: 1 }, rotation: 0, height: 0 },
          ...{ tilt: 0, mount: 'floor', auto: false, camera: null },
        },
      ],
      annotations: [],
    },
  ],
  sources: [],
  notices: [],
});

const rooms = [
  { id: KITCHEN, name: 'Kitchen', position: 1 },
  { id: HALL, name: 'Hall', position: 0 },
];

const devices = [
  deviceFixture(1, { id: LAMP, name: 'Lamp', room_id: HALL }),
  deviceFixture(2, { id: FAN, name: 'Fan', room_id: null }),
  deviceFixture(3, { id: KETTLE, name: 'Kettle', room_id: KITCHEN }),
  deviceFixture(4, { id: SPEAKER, name: 'Speaker', room_id: HALL }),
  deviceFixture(5, { id: CHILD, name: 'Lamp zone', room_id: HALL, parent_id: LAMP }),
  deviceFixture(6, { id: LOST, name: 'Old plug', room_id: '00000000-0000-4000-8000-0000000000ff' }),
];

const query = (change: Partial<PickerQuery> = {}): PickerQuery => ({
  ...{ map, devices, rooms, currentRoomId: null, text: '' },
  ...change,
});

const shape = (input: PickerQuery): readonly (readonly string[])[] =>
  pickerSections(input).map((section) => [
    `${section.title}${section.current ? ' *' : ''}`,
    ...section.devices.map((entry) => entry.device.label),
  ]);

describe('pickerSections', () => {
  it('groups every physical device by its room in the home order, waiting ones first', () => {
    expect(shape(query())).toStrictEqual([
      ['Hall', 'Speaker', 'Lamp'],
      ['Kitchen', 'Kettle'],
      ['No room', 'Fan', 'Old plug'],
    ]);
  });

  it('marks placement and whether the device room is on the map', () => {
    const hall = pickerSections(query())[0]?.devices ?? [];
    expect(hall.map(({ placed, onMap }) => ({ placed, onMap }))).toStrictEqual([
      { placed: false, onMap: true },
      { placed: true, onMap: true },
    ]);
    const kitchen = pickerSections(query())[1]?.devices[0];
    expect(kitchen).toMatchObject({ placed: false, onMap: false });
  });

  it('moves the current room to the top and marks it', () => {
    expect(shape(query({ currentRoomId: KITCHEN }))).toStrictEqual([
      ['Kitchen *', 'Kettle'],
      ['Hall', 'Speaker', 'Lamp'],
      ['No room', 'Fan', 'Old plug'],
    ]);
  });

  it('searches device names and room names, dropping empty sections', () => {
    expect(shape(query({ text: ' KET ' }))).toStrictEqual([['Kitchen', 'Kettle']]);
    expect(shape(query({ text: 'hall' }))).toStrictEqual([['Hall', 'Speaker', 'Lamp']]);
    expect(shape(query({ text: 'nothing like it' }))).toStrictEqual([]);
  });

  it('counts the physical devices that are not on the map yet', () => {
    expect(waitingCount(map, devices)).toBe(4);
  });

  it('places automatically only the waiting devices whose room is on the map', () => {
    expect(placeableIds(map, devices)).toStrictEqual([SPEAKER]);
  });
});
