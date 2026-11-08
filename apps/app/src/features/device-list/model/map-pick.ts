import type { ScenePick } from '../../../components/house-map/3d/render-core-pick';
import { type HomeMapSelection, NO_SELECTION } from '../../home-map';

export interface PickFloor {
  readonly rooms: readonly { readonly id: string; readonly homeRoomId: string | null }[];
  readonly placements: readonly { readonly deviceId: string; readonly roomId: string | null }[];
}

export function selectedRooms(floor: PickFloor, focus: HomeMapSelection): readonly string[] {
  if (focus.kind === 'device') {
    const placed = floor.placements.find((placement) => placement.deviceId === focus.deviceId);
    const roomId = placed?.roomId ?? null;
    return roomId === null ? [] : [roomId];
  }
  if (focus.kind !== 'room') return [];
  return floor.rooms.filter((room) => room.homeRoomId === focus.roomId).map((room) => room.id);
}

export function selectionOfHit(floor: PickFloor, pick: ScenePick): HomeMapSelection | null {
  if (pick.kind === 'device') return { kind: 'device', deviceId: pick.id };
  if (pick.kind !== 'room') return null;
  const homeRoomId = floor.rooms.find((candidate) => candidate.id === pick.id)?.homeRoomId ?? null;
  return homeRoomId === null ? NO_SELECTION : { kind: 'room', roomId: homeRoomId };
}
