import { describe, expect, it } from 'vitest';
import { selectedRooms, selectionOfHit, type PickFloor } from './map-pick';

const FLOOR: PickFloor = {
  rooms: [
    { id: 'r1', homeRoomId: 'kitchen' },
    { id: 'r2', homeRoomId: null },
  ],
  placements: [
    { deviceId: 'lamp', roomId: 'r1' },
    { deviceId: 'loose', roomId: null },
  ],
};

describe('picking on the pinned map', () => {
  it('turns a room tap into its hub room and a tap on an unlinked room into no selection', () => {
    expect(selectionOfHit(FLOOR, { kind: 'room', id: 'r1' })).toEqual({
      kind: 'room',
      roomId: 'kitchen',
    });
    expect(selectionOfHit(FLOOR, { kind: 'room', id: 'r2' })).toEqual({ kind: 'none' });
  });

  it('turns a device tap into that device and ignores wall and empty taps', () => {
    expect(selectionOfHit(FLOOR, { kind: 'device', id: 'lamp' })).toEqual({
      kind: 'device',
      deviceId: 'lamp',
    });
    expect(selectionOfHit(FLOOR, { kind: 'none' })).toBeNull();
    expect(selectionOfHit(FLOOR, { kind: 'wall', id: 'w', offset: 0 })).toBeNull();
  });

  it('highlights the selected room, or the room a selected device stands in', () => {
    expect(selectedRooms(FLOOR, { kind: 'room', roomId: 'kitchen' })).toEqual(['r1']);
    expect(selectedRooms(FLOOR, { kind: 'device', deviceId: 'lamp' })).toEqual(['r1']);
    expect(selectedRooms(FLOOR, { kind: 'device', deviceId: 'loose' })).toEqual([]);
    expect(selectedRooms(FLOOR, { kind: 'none' })).toEqual([]);
  });
});
