import {
  boundsOfPoints,
  type RenderBounds,
  type RenderFloor,
} from '../../../components/house-map/render-scene';

export const ROOM_FOCUS_MARGIN_M = 0.6;

export interface RoomFocus {
  readonly floor: RenderFloor;
  readonly mapRoomIds: readonly string[];
}

function padded(bounds: RenderBounds): RenderBounds {
  return {
    minX: bounds.minX - ROOM_FOCUS_MARGIN_M,
    minY: bounds.minY - ROOM_FOCUS_MARGIN_M,
    maxX: bounds.maxX + ROOM_FOCUS_MARGIN_M,
    maxY: bounds.maxY + ROOM_FOCUS_MARGIN_M,
  };
}

export function roomFocus(floors: readonly RenderFloor[], homeRoomId: string): RoomFocus | null {
  for (const floor of floors) {
    const rooms = floor.rooms.filter((room) => room.homeRoomId === homeRoomId && !room.hidden);
    const bounds = boundsOfPoints(
      rooms.flatMap((room) => room.polygons.flatMap((polygon) => polygon.outer)),
    );
    if (bounds !== null) {
      return {
        floor: { ...floor, bounds: padded(bounds) },
        mapRoomIds: rooms.map((room) => room.id),
      };
    }
  }
  return null;
}
