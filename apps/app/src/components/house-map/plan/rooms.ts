import type { RenderFloor, RenderPoint, RenderRoom, RenderZone } from '../render-scene';

export const NO_ZONES: readonly RenderZone[] = [];

export const roomRings = (room: RenderRoom): readonly (readonly RenderPoint[])[] =>
  room.polygons.flatMap((polygon) => [polygon.outer, ...polygon.holes]);

export const roomTitle = (room: RenderRoom): string => room.name ?? 'Room';

export const shownRooms = (floor: Pick<RenderFloor, 'rooms'>): readonly RenderRoom[] =>
  floor.rooms.filter((room) => !room.hidden);

function countOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function describePlan(
  floor: Pick<RenderFloor, 'rooms' | 'vacuum'>,
  name: string | null,
  currentRoomId: string | null,
  status: string | null,
): string {
  const rooms = shownRooms(floor);
  const current = rooms.find((room) => room.id === currentRoomId);
  const restricted = (floor.vacuum?.zones ?? NO_ZONES).filter(
    (zone) => zone.kind === 'no_go' || zone.kind === 'no_mop',
  );
  return [
    `Map of ${name ?? 'Home'}`,
    rooms.length === 0 ? 'no rooms' : countOf(rooms.length, 'room'),
    ...(restricted.length === 0 ? [] : [countOf(restricted.length, 'restricted area')]),
    ...robotWords(floor, current),
    ...(status === null ? [] : [status]),
  ].join(', ');
}

function robotWords(
  floor: Pick<RenderFloor, 'vacuum'>,
  current: RenderRoom | undefined,
): readonly string[] {
  if ((floor.vacuum?.robot ?? null) === null) return [];
  return [current === undefined ? 'robot on the map' : `robot in ${roomTitle(current)}`];
}
