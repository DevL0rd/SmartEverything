import {
  HOME_MAP_WALL_THICKNESS,
  homeMapOpeningEnds,
  homeMapPolygonArea,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapOpening,
  type HomeMapRoom,
  type HomeMapWall,
} from '@smarteverything/domain';
import {
  floorBounds,
  mergeBounds,
  renderRoomAt,
  sceneKeyHash,
  type RenderFloor,
  type RenderMarker,
  type RenderMeasure,
  type RenderObject,
  type RenderOpening,
  type RenderPlacement,
  type RenderPoint,
  type RenderRoom,
  type RenderScene,
  type RenderSceneIssue,
} from '../render-scene';

export interface HomeMapSceneRoomLink {
  readonly homeRoomId: string | null;
  readonly name: string | null;
}

export interface HomeMapSceneDevice {
  readonly name: string;
  readonly kind: string | null;
}

export interface HomeMapSceneLive {
  readonly homeRoomName?: (homeRoomId: string) => string | null;
  readonly sourceRoom?: (sourceId: string, ref: string) => HomeMapSceneRoomLink | null;
  readonly device?: (deviceId: string) => HomeMapSceneDevice | null;
}

export interface HomeMapSceneInput {
  readonly map: HomeMap;
  readonly live: HomeMapSceneLive;
}

export const OPENING_SIDE_PROBE_METRES = 0.05;

function sourceLink(room: HomeMapRoom, live: HomeMapSceneLive): HomeMapSceneRoomLink | null {
  if (room.origin.kind === 'hand') return null;
  return live.sourceRoom?.(room.origin.sourceId, room.origin.ref) ?? null;
}

function homeMapRoomLink(room: HomeMapRoom, live: HomeMapSceneLive): HomeMapSceneRoomLink {
  const source = sourceLink(room, live);
  const homeRoomId = room.homeRoomId ?? source?.homeRoomId ?? null;
  const homeName = homeRoomId === null ? null : (live.homeRoomName?.(homeRoomId) ?? null);
  return { homeRoomId, name: homeName ?? source?.name ?? room.name };
}

function roomOf(room: HomeMapRoom, floor: HomeMapFloor, live: HomeMapSceneLive): RenderRoom {
  const link = homeMapRoomLink(room, live);
  return {
    id: room.id,
    name: link.name,
    homeRoomId: link.homeRoomId,
    polygons: [room.polygon],
    labelAt: room.labelAt,
    colourSlot: room.colourSlot,
    floor: { status: 'material', ...room.floorMaterial },
    wallPaint: room.wallPaint,
    ceilingHeight: room.ceilingHeight ?? floor.ceilingHeight,
    areaM2: homeMapPolygonArea(room.polygon),
    hidden: false,
  };
}

function sideRooms(
  rooms: readonly RenderRoom[],
  wall: HomeMapWall,
  ends: { readonly from: RenderPoint; readonly to: RenderPoint },
): string[] {
  const dx = ends.to.x - ends.from.x;
  const dy = ends.to.y - ends.from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [];
  const reach = wall.thickness / 2 + OPENING_SIDE_PROBE_METRES;
  const mid = { x: (ends.from.x + ends.to.x) / 2, y: (ends.from.y + ends.to.y) / 2 };
  const normal = { x: (-dy / length) * reach, y: (dx / length) * reach };
  const sides = [
    renderRoomAt(rooms, { x: mid.x + normal.x, y: mid.y + normal.y }),
    renderRoomAt(rooms, { x: mid.x - normal.x, y: mid.y - normal.y }),
  ];
  return [...new Set(sides.flatMap((id) => (id === null ? [] : [id])))];
}

function openingOf(
  opening: HomeMapOpening,
  wall: HomeMapWall,
  rooms: readonly RenderRoom[],
): RenderOpening {
  const ends = homeMapOpeningEnds(wall, opening.offset, opening.width);
  return {
    id: opening.id,
    wallId: wall.id,
    from: ends.from,
    to: ends.to,
    kind: opening.kind,
    sourceKind: null,
    sillHeight: opening.sillHeight,
    headHeight: opening.headHeight,
    hinge: opening.hinge,
    swing: opening.swing,
    contactDeviceId: opening.contactDeviceId,
    lockDeviceId: opening.lockDeviceId,
    roomIds: sideRooms(rooms, wall, ends),
  };
}

interface Openings {
  readonly openings: readonly RenderOpening[];
  readonly issues: readonly RenderSceneIssue[];
}

function openingsOf(floor: HomeMapFloor, rooms: readonly RenderRoom[]): Openings {
  const walls = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const openings: RenderOpening[] = [];
  const issues: RenderSceneIssue[] = [];
  for (const opening of floor.openings) {
    const wall = walls.get(opening.wallId);
    if (wall === undefined) {
      issues.push({ kind: 'opening_without_wall', floorId: floor.id, elementId: opening.id });
    } else {
      openings.push(openingOf(opening, wall, rooms));
    }
  }
  return { openings, issues };
}

function annotationsOf(floor: HomeMapFloor): {
  readonly markers: RenderMarker[];
  readonly measures: RenderMeasure[];
} {
  const markers: RenderMarker[] = [];
  const measures: RenderMeasure[] = [];
  for (const note of floor.annotations) {
    if (note.kind === 'measure') {
      measures.push({ id: note.id, from: note.from, to: note.to, text: note.text });
    } else {
      markers.push({ id: note.id, kind: note.kind, at: note.at, label: note.text });
    }
  }
  return { markers, measures };
}

function objectsOf(floor: HomeMapFloor, rooms: readonly RenderRoom[]): RenderObject[] {
  return floor.objects.map((item) => ({
    id: item.id,
    modelId: item.modelId,
    kind: item.modelId,
    label: item.label,
    finish: item.finish,
    params: item.params,
    at: item.at,
    rotationDeg: item.rotation,
    elevation: item.elevation,
    footprint: null,
    height: null,
    locked: item.locked,
    roomId: renderRoomAt(rooms, item.at),
    wall: item.wall ?? null,
  }));
}

function placementsOf(
  floor: HomeMapFloor,
  rooms: readonly RenderRoom[],
  live: HomeMapSceneLive,
): RenderPlacement[] {
  return floor.placements.map((placement) => {
    const device = live.device?.(placement.deviceId) ?? null;
    return {
      deviceId: placement.deviceId,
      name: device?.name ?? null,
      kind: device?.kind ?? null,
      at: placement.at,
      rotationDeg: placement.rotation,
      height: placement.height,
      tiltDeg: placement.tilt,
      mount: placement.mount,
      auto: placement.auto,
      camera: placement.camera,
      roomId: renderRoomAt(rooms, placement.at),
      wall: placement.wall ?? null,
    };
  });
}

function floorOf(floor: HomeMapFloor, live: HomeMapSceneLive): RenderFloor & Openings {
  const rooms = floor.rooms.map((room) => roomOf(room, floor, live));
  const { openings, issues } = openingsOf(floor, rooms);
  const base = {
    id: floor.id,
    name: floor.name,
    level: floor.level,
    elevation: floor.elevation,
    ceilingHeight: floor.ceilingHeight,
    rooms,
    walls: floor.walls.map((wall) => ({
      id: wall.id,
      from: wall.from,
      to: wall.to,
      thickness: wall.thickness,
      height: wall.height ?? floor.ceilingHeight,
      kind: wall.kind,
      exterior: wall.thickness >= HOME_MAP_WALL_THICKNESS.exterior,
    })),
    openings,
    objects: objectsOf(floor, rooms),
    placements: placementsOf(floor, rooms, live),
    carpets: [],
    ...annotationsOf(floor),
    vacuum: null,
  };
  return { ...base, bounds: floorBounds(base), issues };
}

const liveParts = (floors: readonly RenderFloor[]): string[] =>
  floors.flatMap((floor) => [
    ...floor.rooms.map((room) => `r${room.id}=${room.homeRoomId ?? ''}:${room.name ?? ''}`),
    ...floor.placements.map((item) => `d${item.deviceId}=${item.kind ?? ''}:${item.name ?? ''}`),
  ]);

export function homeMapRenderScene(input: HomeMapSceneInput): RenderScene {
  const built = [...input.map.floors]
    .sort((a, b) => a.level - b.level)
    .map((floor) => floorOf(floor, input.live));
  const floors: RenderFloor[] = built.map(({ issues: _issues, ...floor }) => floor);
  return {
    key: `home:${String(input.map.revision)}:${sceneKeyHash(liveParts(floors))}`,
    source: 'home_map',
    bounds: mergeBounds(floors.map((floor) => floor.bounds)),
    floors,
    issues: built.flatMap((floor) => floor.issues),
  };
}
