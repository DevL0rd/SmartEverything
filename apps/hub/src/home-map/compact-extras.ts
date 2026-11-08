import {
  homeMapRoomAt,
  homeMapWallLength,
  homeMapWallPointAt,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapOpening,
  type HomeMapRoom,
  type HomeMapScan,
  type HomeMapVec,
  type HomeMapWall,
} from '@smarteverything/domain';

const ROUND = 100;

const PROBE_BEYOND_FACE_M = 0.05;

export const roundMetres = (value: number): number => Math.round(value * ROUND) / ROUND;

const pointOf = (point: HomeMapVec): { readonly x: number; readonly y: number } => ({
  x: roundMetres(point.x),
  y: roundMetres(point.y),
});

type Side = 'left' | 'right';

const SIDES: readonly Side[] = ['left', 'right'];

function roomBeside(
  rooms: readonly HomeMapRoom[],
  wall: HomeMapWall,
  offset: number,
  side: Side,
): HomeMapRoom | null {
  const length = homeMapWallLength(wall);
  if (length === 0) return null;
  const dx = (wall.to.x - wall.from.x) / length;
  const dy = (wall.to.y - wall.from.y) / length;
  const sign = side === 'left' ? 1 : -1;
  const foot = homeMapWallPointAt(wall, offset);
  const reach = wall.thickness / 2 + PROBE_BEYOND_FACE_M;
  return homeMapRoomAt(rooms, {
    x: foot.x - sign * dy * reach,
    y: foot.y + sign * dx * reach,
  });
}

function roomIdsAround(floor: HomeMapFloor, opening: HomeMapOpening): readonly string[] {
  const wall = floor.walls.find((candidate) => candidate.id === opening.wallId);
  if (wall === undefined) return [];
  const middle = opening.offset + opening.width / 2;
  const ids = SIDES.flatMap((side) => roomBeside(floor.rooms, wall, middle, side)?.id ?? []);
  return [...new Set(ids)];
}

export function openingsOf(floor: HomeMapFloor): readonly Record<string, unknown>[] {
  return floor.openings.map((opening) => ({
    id: opening.id,
    kind: opening.kind,
    ...(opening.opens === undefined ? {} : { opens: opening.opens }),
    wallId: opening.wallId,
    offsetM: roundMetres(opening.offset),
    widthM: roundMetres(opening.width),
    roomIds: roomIdsAround(floor, opening),
    contactDeviceId: opening.contactDeviceId,
    lockDeviceId: opening.lockDeviceId,
  }));
}

export function objectFacts(object: HomeMapObject): Record<string, unknown> {
  return {
    at: pointOf(object.at),
    ...(object.rotation === 0 ? {} : { rotation: object.rotation }),
    ...(object.elevation === 0 ? {} : { elevation: roundMetres(object.elevation) }),
    ...(object.finish === null ? {} : { finish: object.finish }),
    ...(object.locked ? { locked: true } : {}),
    ...(Object.keys(object.params).length === 0 ? {} : { params: object.params }),
    ...(object.style === undefined ? {} : { style: object.style }),
    ...(object.flipped === undefined ? {} : { flipped: object.flipped }),
    ...(object.wall === undefined ? {} : { wall: object.wall }),
  };
}

export function scanFacts(scan: HomeMapScan | undefined): Record<string, unknown> | null {
  if (scan === undefined) return null;
  return {
    name: scan.file.name,
    format: scan.file.format,
    bytes: scan.file.bytes,
    hasLod: scan.lod !== null,
    transform: scan.transform,
    opacity: scan.opacity,
    residualM: scan.residualM,
    alignedPoints: scan.points.length,
    uploadedAt: scan.uploadedAt,
  };
}
