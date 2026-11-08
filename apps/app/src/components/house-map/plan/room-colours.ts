import { useColourResolver } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';

const ROOM_ROLES: readonly ColourRole[] = [
  'viz-1',
  'viz-3',
  'viz-green',
  'viz-violet',
  'viz-blue',
  'viz-magenta',
  'viz-2',
  'viz-4',
];

export interface RoomColours {
  readonly rooms: readonly string[];
  readonly roomEdge: string;
}

export function useRoomColours(): RoomColours {
  const resolve = useColourResolver();
  return {
    rooms: ROOM_ROLES.map((role) => resolve(role)),
    roomEdge: resolve('outline-variant'),
  };
}

export function roomColourOf(colours: RoomColours, colourSlot: number): string {
  return colours.rooms[colourSlot - 1] ?? colours.roomEdge;
}
