import { describe, expect, it } from 'vitest';
import { isoHouse, isoRoom } from '../../../components/house-map/iso/iso-fixture';
import type { RenderFloor } from '../../../components/house-map/render-scene';
import { ROOM_FOCUS_MARGIN_M, roomFocus } from './room-focus';

const ground: RenderFloor = {
  ...isoHouse(),
  rooms: [{ ...isoRoom('kitchen-shape', 0, 4), homeRoomId: 'room-kitchen' }, isoRoom('hall', 4, 8)],
};

const upstairs: RenderFloor = {
  ...isoHouse(),
  id: 'upper',
  rooms: [
    { ...isoRoom('bed-a', 2, 4), homeRoomId: 'room-bed' },
    { ...isoRoom('bed-b', 4, 7), homeRoomId: 'room-bed' },
    { ...isoRoom('attic', 7, 8), homeRoomId: 'room-attic', hidden: true },
  ],
};

const m = ROOM_FOCUS_MARGIN_M;

describe('room page map focus', () => {
  it('frames the linked map room with a margin and keeps the rest of the floor', () => {
    const focus = roomFocus([ground, upstairs], 'room-kitchen');
    expect(focus?.mapRoomIds).toStrictEqual(['kitchen-shape']);
    expect(focus?.floor.id).toBe('ground');
    expect(focus?.floor.rooms).toHaveLength(2);
    expect(focus?.floor.bounds).toStrictEqual({ minX: -m, minY: -m, maxX: 4 + m, maxY: 4 + m });
  });

  it('frames every map room linked to the hub room on the floor that holds them', () => {
    const focus = roomFocus([ground, upstairs], 'room-bed');
    expect(focus?.floor.id).toBe('upper');
    expect(focus?.mapRoomIds).toStrictEqual(['bed-a', 'bed-b']);
    expect(focus?.floor.bounds).toStrictEqual({ minX: 2 - m, minY: -m, maxX: 7 + m, maxY: 4 + m });
  });

  it('shows no header for a room that is not drawn or is hidden on the map', () => {
    expect(roomFocus([ground, upstairs], 'room-office')).toBeNull();
    expect(roomFocus([ground, upstairs], 'room-attic')).toBeNull();
    expect(roomFocus([], 'room-kitchen')).toBeNull();
  });
});
