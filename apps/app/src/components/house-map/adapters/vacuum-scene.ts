import {
  HOME_MAP_DEFAULT_CEILING_HEIGHT,
  HOME_MAP_OPENING_KINDS,
  HOME_MAP_WALL_THICKNESS,
  homeMapPointInPolygon,
  homeMapRobotFloor,
  homeMapRobotFurnitureModel,
  vacuumSceneVersion,
  type VacuumPoint,
  type VacuumPose,
  type VacuumRoom,
  type VacuumScene,
} from '@smarteverything/domain';
import {
  radiansToDegrees,
  renderRoomAt,
  renderColourSlot,
  sceneKeyHash,
  type RenderFloor,
  type RenderObject,
  type RenderOpening,
  type RenderPoint,
  type RenderPolygon,
  type RenderPose,
  type RenderRoom,
  type RenderRoomFloor,
  type RenderScene,
  type RenderWall,
} from '../render-scene';

export const VACUUM_FLOOR_ID = 'vacuum';

export const VACUUM_DOOR_HEAD_METRES = 2;

export interface VacuumSceneRoomLink {
  readonly homeRoomId: string;
  readonly name: string;
}

export interface VacuumSceneInput {
  readonly scene: VacuumScene;
  readonly roomLink?: (mapRoomId: number) => VacuumSceneRoomLink | null;
}

const point = (source: VacuumPoint): RenderPoint => ({ x: source.x, y: source.y });

const pose = (source: VacuumPose | null): RenderPose | null =>
  source === null ? null : { x: source.x, y: source.y, yawDeg: radiansToDegrees(source.yaw) };

const signedArea = (ring: readonly VacuumPoint[]): number =>
  ring.reduce((sum, current, index) => {
    const next = ring[(index + 1) % ring.length] ?? current;
    return sum + current.x * next.y - next.x * current.y;
  }, 0) / 2;

interface MutablePolygon {
  readonly outer: RenderPoint[];
  readonly holes: RenderPoint[][];
}

export function vacuumRoomPolygons(rings: readonly (readonly VacuumPoint[])[]): RenderPolygon[] {
  const outers: MutablePolygon[] = rings
    .filter((ring) => signedArea(ring) > 0)
    .sort((a, b) => signedArea(b) - signedArea(a))
    .map((ring) => ({ outer: ring.map(point), holes: [] }));
  for (const hole of rings.filter((ring) => signedArea(ring) < 0)) {
    const first = hole[0];
    const owner = outers
      .filter(
        (part) =>
          first !== undefined && homeMapPointInPolygon({ outer: part.outer, holes: [] }, first),
      )
      .at(-1);
    owner?.holes.push(hole.map(point));
  }
  return outers;
}

const roomFloor = (code: number): RenderRoomFloor => {
  const floor = homeMapRobotFloor(code);
  if (floor.status === 'known') {
    return { status: 'material', kind: floor.kind, variant: floor.variant, tint: null };
  }
  return floor;
};

function roomOf(room: VacuumRoom, input: VacuumSceneInput): RenderRoom {
  const link = input.roomLink?.(room.id) ?? null;
  return {
    id: String(room.id),
    name: link?.name ?? room.name,
    homeRoomId: link?.homeRoomId ?? null,
    polygons: vacuumRoomPolygons(room.rings),
    labelAt: point(room.label),
    colourSlot: renderColourSlot(room.colour),
    floor: roomFloor(room.floor),
    wallPaint: null,
    ceilingHeight: HOME_MAP_DEFAULT_CEILING_HEIGHT,
    areaM2: room.areaM2,
    hidden: room.hidden,
  };
}

const openingKind = (kind: string): RenderOpening['kind'] =>
  HOME_MAP_OPENING_KINDS.find((known) => known === kind) ?? 'opening';

function wallsOf(scene: VacuumScene): RenderWall[] {
  return scene.walls.map((wall, index) => {
    const exterior = wall.kind === 'exterior';
    return {
      id: `wall:${String(index)}`,
      from: point(wall.from),
      to: point(wall.to),
      thickness: exterior ? HOME_MAP_WALL_THICKNESS.exterior : HOME_MAP_WALL_THICKNESS.interior,
      height: wall.height ?? HOME_MAP_DEFAULT_CEILING_HEIGHT,
      kind: 'solid',
      exterior,
    };
  });
}

function openingsOf(scene: VacuumScene): RenderOpening[] {
  return scene.doors.map((door, index) => ({
    id: `door:${String(index)}`,
    wallId: null,
    from: point(door.from),
    to: point(door.to),
    kind: openingKind(door.kind),
    sourceKind: door.kind,
    sillHeight: 0,
    headHeight: VACUUM_DOOR_HEAD_METRES,
    hinge: 'left',
    swing: 'in',
    contactDeviceId: null,
    lockDeviceId: null,
    roomIds: door.rooms.map(String),
  }));
}

const centroid = (ring: readonly RenderPoint[]): RenderPoint => ({
  x: ring.reduce((sum, at) => sum + at.x, 0) / ring.length,
  y: ring.reduce((sum, at) => sum + at.y, 0) / ring.length,
});

function objectsOf(scene: VacuumScene, rooms: readonly RenderRoom[]): RenderObject[] {
  return scene.furniture.map((item) => {
    const footprint = item.ring.map(point);
    const at = centroid(footprint);
    return {
      id: `furniture:${String(item.id)}`,
      modelId: homeMapRobotFurnitureModel(item.kind),
      kind: item.kind,
      label: null,
      finish: null,
      params: {},
      at,
      rotationDeg: 0,
      elevation: 0,
      footprint,
      height: item.height,
      locked: false,
      roomId: renderRoomAt(rooms, at),
      wall: null,
    };
  });
}

function floorOf(input: VacuumSceneInput): RenderFloor {
  const { scene } = input;
  const rooms = scene.rooms.map((room) => roomOf(room, input));
  return {
    id: VACUUM_FLOOR_ID,
    name: scene.name ?? 'Robot map',
    level: 0,
    elevation: 0,
    ceilingHeight: HOME_MAP_DEFAULT_CEILING_HEIGHT,
    bounds: scene.bounds,
    rooms,
    walls: wallsOf(scene),
    openings: openingsOf(scene),
    objects: objectsOf(scene, rooms),
    placements: [],
    carpets: scene.carpets.map((carpet) => ({
      id: `carpet:${String(carpet.id)}`,
      kind: carpet.kind,
      ring: carpet.ring.map(point),
    })),
    markers: scene.objects.map((item) => ({
      id: `object:${String(item.id)}`,
      kind: item.kind,
      at: point(item.at),
      label: item.label,
    })),
    measures: [],
    vacuum: {
      dock: pose(scene.dock),
      robot: pose(scene.robot),
      trail: scene.trail.map((run) => ({ mopping: run.mopping, points: run.points.map(point) })),
      zones: scene.zones.map((zone) => ({
        id: `zone:${String(zone.id)}`,
        kind: zone.kind,
        points: zone.points.map(point),
      })),
    },
  };
}

export function vacuumRenderScene(input: VacuumSceneInput): RenderScene {
  const floor = floorOf(input);
  const names = floor.rooms.map((room) => `${room.id}=${room.homeRoomId ?? ''}:${room.name ?? ''}`);
  return {
    key: `vacuum:${vacuumSceneVersion(input.scene)}:${sceneKeyHash(names)}`,
    source: 'vacuum',
    bounds: floor.bounds,
    floors: [floor],
    issues: [],
  };
}
