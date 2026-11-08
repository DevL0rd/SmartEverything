import {
  homeMapPolygonArea,
  homeMapRoomAt,
  type HomeMap,
  type HomeMapCompact,
  type HomeMapFloor,
  type HomeMapPlacement,
  type HomeMapRoom,
  type HomeMapVec,
} from '@smarteverything/domain';
import { objectFacts, openingsOf, roundMetres, scanFacts } from './compact-extras';

type CompactFloor = HomeMapCompact['floors'][number];

type CompactBounds = CompactFloor['rooms'][number]['bounds'];

const WINDS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

const FULL_TURN = 360;

const WIND_STEP = 45;

const MIDDLE_FRACTION = 0.35;

const CORNER_FRACTION = 0.5;

const boundsOf = (room: HomeMapRoom): CompactBounds => {
  const xs = room.polygon.outer.map((point) => point.x);
  const ys = room.polygon.outer.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

const windOf = (dx: number, dy: number, north: number): string => {
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  const turned = (((bearing - north) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  return WINDS[Math.round(turned / WIND_STEP) % WINDS.length] ?? WINDS[0];
};

function whereIn(bounds: CompactBounds, at: HomeMapVec, north: number): string {
  const halfX = (bounds.maxX - bounds.minX) / 2;
  const halfY = (bounds.maxY - bounds.minY) / 2;
  const dx = at.x - (bounds.minX + bounds.maxX) / 2;
  const dy = at.y - (bounds.minY + bounds.maxY) / 2;
  const nx = halfX > 0 ? Math.abs(dx) / halfX : 0;
  const ny = halfY > 0 ? Math.abs(dy) / halfY : 0;
  if (Math.max(nx, ny) < MIDDLE_FRACTION) return 'in the middle';
  if (nx > CORNER_FRACTION && ny > CORNER_FRACTION) return `in the ${windOf(dx, dy, north)} corner`;
  return nx >= ny ? `by the ${windOf(dx, 0, north)} wall` : `by the ${windOf(0, dy, north)} wall`;
}

const mountWords = (placement: HomeMapPlacement): string => {
  const height = `${String(roundMetres(placement.height))} m up`;
  switch (placement.mount) {
    case 'ceiling':
      return 'on the ceiling';
    case 'wall':
      return `on the wall, ${height}`;
    case 'table':
      return 'on a table';
    case 'floor':
      return 'on the floor';
  }
};

const nameOf = (room: HomeMapRoom): string => room.name ?? 'an unnamed room';

function deviceOf(
  floor: HomeMapFloor,
  placement: HomeMapPlacement,
  north: number,
): CompactFloor['devices'][number] {
  const room = homeMapRoomAt(floor.rooms, placement.at);
  const where =
    room === null
      ? 'Outside every room'
      : `${nameOf(room)}, ${whereIn(boundsOf(room), placement.at, north)}`;
  return {
    deviceId: placement.deviceId,
    roomId: room?.id ?? null,
    position: `${where}, ${mountWords(placement)}`,
  };
}

function floorOf(
  floor: HomeMapFloor,
  map: HomeMap,
  catalogueName: (modelId: string) => string,
): CompactFloor {
  return {
    id: floor.id,
    name: floor.name,
    level: floor.level,
    rooms: floor.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      homeRoomId: room.homeRoomId,
      areaSquareMetres: roundMetres(homeMapPolygonArea(room.polygon)),
      bounds: boundsOf(room),
    })),
    objects: floor.objects.map((object) => ({
      id: object.id,
      name: object.label ?? catalogueName(object.modelId),
      modelId: object.modelId,
      roomId: homeMapRoomAt(floor.rooms, object.at)?.id ?? null,
      ...objectFacts(object),
    })),
    openings: openingsOf(floor),
    devices: floor.placements.map((placement) => deviceOf(floor, placement, map.north)),
  };
}

export function compactHomeMap(
  map: HomeMap,
  catalogueName: (modelId: string) => string,
): HomeMapCompact {
  return {
    view: 'compact',
    revision: map.revision,
    name: map.name,
    north: map.north,
    scan: scanFacts(map.scan),
    floors: map.floors.map((floor) => floorOf(floor, map, catalogueName)),
  };
}
