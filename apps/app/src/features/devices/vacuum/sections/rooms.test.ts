import { describe, expect, it } from 'vitest';
import type { ShownRoom } from '../model/room-names';
import { FLOOR_OPTIONS, floorEdit, floorLabel } from './room-floor';
import { headingLine, roomRows } from './rooms';

function roomOf(
  id: number,
  name: string,
  areaM2: number,
  extra: Partial<ShownRoom> = {},
): ShownRoom {
  return {
    id,
    name,
    robotName: name,
    homeRoomId: null,
    colour: id,
    floor: 0,
    hidden: false,
    areaM2,
    label: { x: 0, y: 0 },
    rings: [],
    settings: null,
    ...extra,
  };
}

describe('rooms section rows', () => {
  it('lists every room by id, hidden ones included, with its share of the home', () => {
    const rows = roomRows([
      roomOf(6, 'Attic', 10, { hidden: true }),
      roomOf(3, 'Kitchen', 30, { floor: 4010 }),
    ]);
    expect(rows.map((row) => row.id)).toStrictEqual([3, 6]);
    expect(rows.map((row) => row.share)).toStrictEqual([0.75, 0.25]);
    expect(rows[0]?.label).toBe('Kitchen, 30 square metres, Wood floor');
    expect(rows[1]?.label).toBe('Attic, 10 square metres, Floor type not set, hidden on the map');
  });

  it('shows the linked home room name with its icon and the robot name beside it', () => {
    const [row] = roomRows([
      roomOf(4, 'Master bedroom', 20, { robotName: 'Bedroom', homeRoomId: 'room-2' }),
    ]);
    expect(row?.name).toBe('Master bedroom');
    expect(row?.robotName).toBe('Bedroom');
    expect(row?.homeIcon).toBe('bed');
    expect(row?.label).toBe(
      'Master bedroom, Bedroom on the robot, 20 square metres, Floor type not set',
    );
    expect(roomRows([roomOf(3, 'Kitchen', 10)])[0]?.homeIcon).toBeNull();
  });

  it('has no share when the map has no area', () => {
    expect(roomRows([roomOf(3, 'Kitchen', 0)])[0]?.share).toBe(0);
  });
});

describe('floor material', () => {
  it('names the six materials the robot knows and falls back to the raw code', () => {
    expect(FLOOR_OPTIONS.map((option) => option.value)).toStrictEqual([
      '0',
      '4000',
      '4010',
      '4011',
      '4020',
      '4030',
    ]);
    expect(floorLabel(4030)).toBe('Marble');
    expect(floorLabel(4999)).toBe('Floor 4999');
  });

  it('sends the chosen material as its code', () => {
    expect(floorEdit('4011')).toStrictEqual({ floor: 4011 });
  });
});

describe('rooms modules', () => {
  it('load without a browser or a device', async () => {
    const [rooms, picker, links, linking, calls] = await Promise.all([
      import('./rooms'),
      import('./room-link-picker'),
      import('./rooms-links'),
      import('./use-room-linking'),
      import('../data/room-link-calls'),
    ]);
    expect(typeof rooms.VacuumRooms).toBe('function');
    expect(typeof picker.RoomLinkPicker).toBe('function');
    expect(typeof links.RoomLinkField).toBe('function');
    expect(typeof linking.useRoomLinking).toBe('function');
    expect(typeof calls.applyLinkChange).toBe('function');
  });
});

describe('room heading line', () => {
  it('leaves out an unset floor type and keeps the facts that are set', () => {
    const [plain, attic] = roomRows([
      roomOf(1, 'Hall', 4),
      roomOf(2, 'Attic', 10, { robotName: 'Room2', floor: 4030, hidden: true }),
    ]);
    if (plain === undefined || attic === undefined) throw new Error('rows missing');
    expect(headingLine(plain)).toBeNull();
    expect(headingLine(attic)).toBe('Marble · Hidden on the map · Room2 on the robot');
  });
});
