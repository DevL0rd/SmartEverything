import { describe, expect, it } from 'vitest';
import { roomAt, roomHolds } from './room-at';
import {
  NO_SELECTION,
  ordinal,
  orderOf,
  pruneSelection,
  roomChips,
  startLabel,
  toggleRoom,
  type SelectableRoom,
} from './room-selection';

const ROOMS: readonly SelectableRoom[] = [
  { id: 5, name: 'Study', colour: 3, floor: 0, areaM2: 20.4, hidden: false },
  { id: 3, name: 'Kitchen', colour: 1, floor: 4000, areaM2: 12, hidden: false },
  { id: 6, name: 'Attic', colour: 2, floor: 0, areaM2: 50, hidden: true },
];

describe('room selection order', () => {
  it('keeps the order rooms were tapped and renumbers after a removal', () => {
    const selection = toggleRoom(toggleRoom(toggleRoom(NO_SELECTION, 5), 3), 8);
    expect(selection).toStrictEqual([5, 3, 8]);
    expect(orderOf(selection, 3)).toBe(2);
    const without = toggleRoom(selection, 5);
    expect(without).toStrictEqual([3, 8]);
    expect(orderOf(without, 3)).toBe(1);
    expect(orderOf(without, 5)).toBeNull();
  });

  it('does not change the selection it was given', () => {
    const selection = [3];
    toggleRoom(selection, 5);
    expect(selection).toStrictEqual([3]);
  });

  it('drops rooms that vanished or are hidden and keeps the same array when nothing changed', () => {
    const kept = [5, 3];
    expect(pruneSelection(kept, ROOMS)).toBe(kept);
    expect(pruneSelection([5, 6, 99, 3], ROOMS)).toStrictEqual([5, 3]);
  });

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toStrictEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
      '111th',
    ]);
  });

  it('builds chips by room id, without hidden rooms, with order, now and a spoken label', () => {
    const chips = roomChips(ROOMS, [5, 3], 3);
    expect(chips.map((chip) => chip.id)).toStrictEqual([3, 5]);
    expect(chips[0]).toMatchObject({ order: 2, selected: true, now: true });
    expect(chips[0]?.label).toBe('Kitchen, 12 square metres, selected, 2nd, robot is here');
    expect(chips[1]?.label).toBe('Study, 20 square metres, selected, 1st');
    expect(roomChips(ROOMS, NO_SELECTION, null)[0]?.label).toBe('Kitchen, 12 square metres');
  });

  it('does not reorder the rooms it was given', () => {
    const before = ROOMS.map((room) => room.id);
    roomChips(ROOMS, NO_SELECTION, null);
    expect(ROOMS.map((room) => room.id)).toStrictEqual(before);
  });

  it('labels the start button by what will be cleaned', () => {
    expect(startLabel(0, 0)).toBe('Start');
    expect(startLabel(1, 0)).toBe('Clean 1 room');
    expect(startLabel(2, 0)).toBe('Clean 2 rooms');
    expect(startLabel(0, 1)).toBe('Clean zone');
    expect(startLabel(2, 3)).toBe('Clean 3 zones');
  });
});

const SQUARE = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

const HOLE = [
  { x: 1, y: 1 },
  { x: 3, y: 1 },
  { x: 3, y: 3 },
  { x: 1, y: 3 },
];

describe('room under the robot', () => {
  it('finds the room whose outline holds the point', () => {
    const rooms = [
      { id: 3, rings: [SQUARE] },
      { id: 4, rings: [SQUARE.map((p) => ({ x: p.x + 10, y: p.y }))] },
    ];
    expect(roomAt(rooms, { x: 2, y: 2 })).toBe(3);
    expect(roomAt(rooms, { x: 12, y: 2 })).toBe(4);
    expect(roomAt(rooms, { x: 7, y: 2 })).toBeNull();
    expect(roomAt(rooms, null)).toBeNull();
  });

  it('treats a second ring as a hole', () => {
    const room = { rings: [SQUARE, HOLE] };
    expect(roomHolds(room, { x: 0.5, y: 0.5 })).toBe(true);
    expect(roomHolds(room, { x: 2, y: 2 })).toBe(false);
  });
});
