import type { VacuumPoint, VacuumRoom } from '@smarteverything/domain';

type Ring = readonly VacuumPoint[];

function crossings(ring: Ring, point: VacuumPoint): number {
  let count = 0;
  let previous = ring[ring.length - 1];
  for (const current of ring) {
    if (previous !== undefined) {
      const straddles = current.y > point.y !== previous.y > point.y;
      if (
        straddles &&
        point.x <
          ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x
      ) {
        count += 1;
      }
    }
    previous = current;
  }
  return count;
}

export function roomHolds(room: Pick<VacuumRoom, 'rings'>, point: VacuumPoint): boolean {
  let inside = false;
  for (const ring of room.rings) {
    if (crossings(ring, point) % 2 === 1) {
      inside = !inside;
    }
  }
  return inside;
}

export function roomAt(
  rooms: readonly Pick<VacuumRoom, 'id' | 'rings'>[],
  point: VacuumPoint | null,
): number | null {
  if (point === null) {
    return null;
  }
  return rooms.find((room) => roomHolds(room, point))?.id ?? null;
}
