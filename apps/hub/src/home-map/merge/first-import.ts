import {
  HOME_MAP_OBJECT_WRITE,
  HOME_MAP_OPENING_WRITE,
  HOME_MAP_PLACEMENT_WRITE,
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_SOURCE_ID,
  HOME_MAP_SOURCE_WRITE,
  HOME_MAP_WALL_WRITE,
  homeMapRobotFloor,
  type HomeMapObject,
  type HomeMapOpening,
  type HomeMapPlacement,
  type HomeMapRingShape,
  type HomeMapRoom,
  type HomeMapSource,
  type HomeMapSourceGeometry,
  type HomeMapVec,
  type HomeMapWall,
} from '@smarteverything/domain';
import {
  estimateRectifyTransform,
  rectifyScene,
  type RectifiedFurniture,
  type RectifiedRoom,
  type RectifiedScene,
  type RectifySkip,
  type RectifyTransform,
} from './rectify';

export const HOME_MAP_RUG_MODEL_ID = 'cat.rugs.rug-rectangle';
export const HOME_MAP_ROBOT_BOX_MODEL_ID = 'home.box';
export const HOME_MAP_UNSET_FLOOR = { kind: 'plain', variant: null, tint: null } as const;

const COLOUR_SLOTS = 8;
const DOOR_SILL_M = 0;
const DOOR_HEAD_M = 2;

export interface FirstImportInput {
  readonly geometry: HomeMapSourceGeometry;
  readonly sourceKind: HomeMapSource['kind'];
  readonly sourceId: string;
  readonly deviceId: string;
  readonly floorId: string;
  readonly importedAt: string;
  readonly newId: () => string;
  readonly transform?: RectifyTransform | undefined;
}

export interface FirstImportResult {
  readonly rooms: readonly HomeMapRoom[];
  readonly walls: readonly HomeMapWall[];
  readonly openings: readonly HomeMapOpening[];
  readonly objects: readonly HomeMapObject[];
  readonly placements: readonly HomeMapPlacement[];
  readonly source: HomeMapSource;
  readonly skipped: readonly RectifySkip[];
}

interface OrientedBox {
  readonly centre: HomeMapVec;
  readonly width: number;
  readonly depth: number;
  readonly rotationDeg: number;
}

const QUARTER_TURN_DEG = 90;
const MIN_GAIN = 1 - 1e-9;

function boxAt(ring: HomeMapRingShape, angleDeg: number): OrientedBox & { readonly area: number } {
  const cos = Math.cos((angleDeg * Math.PI) / 180);
  const sin = Math.sin((angleDeg * Math.PI) / 180);
  const us = ring.map((p) => p.x * cos + p.y * sin);
  const vs = ring.map((p) => -p.x * sin + p.y * cos);
  const [u0, u1] = [Math.min(...us), Math.max(...us)];
  const [v0, v1] = [Math.min(...vs), Math.max(...vs)];
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  return {
    centre: { x: cu * cos - cv * sin, y: cu * sin + cv * cos },
    width: v1 - v0,
    depth: u1 - u0,
    rotationDeg: angleDeg,
    area: (u1 - u0) * (v1 - v0),
  };
}

export function orientedBox(ring: HomeMapRingShape): OrientedBox {
  const angles = ring
    .map((point, index) => {
      const next = ring[(index + 1) % ring.length] ?? point;
      const deg = (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI;
      return ((deg % QUARTER_TURN_DEG) + QUARTER_TURN_DEG) % QUARTER_TURN_DEG;
    })
    .sort((p, q) => p - q);
  let best = boxAt(ring, angles[0] ?? 0);
  for (const angle of angles) {
    const candidate = boxAt(ring, angle);
    if (candidate.area < best.area * MIN_GAIN) best = candidate;
  }
  return best;
}

const sourceOrigin = (sourceId: string, ref: string): HomeMapObject['origin'] => ({
  kind: 'source',
  sourceId: HOME_MAP_SOURCE_ID.parse(sourceId),
  ref,
  overridden: [],
});

function floorMaterialOf(code: number | null): HomeMapRoom['floorMaterial'] {
  const floor = code === null ? null : homeMapRobotFloor(code);
  return floor?.status === 'known'
    ? { kind: floor.kind, variant: floor.variant, tint: null }
    : { ...HOME_MAP_UNSET_FLOOR };
}

function roomOf(input: FirstImportInput, room: RectifiedRoom, index: number): HomeMapRoom {
  return HOME_MAP_ROOM_WRITE.parse({
    id: input.newId(),
    name: room.name,
    homeRoomId: null,
    polygon: room.polygon,
    labelAt: room.labelAt,
    colourSlot: (index % COLOUR_SLOTS) + 1,
    floorMaterial: floorMaterialOf(room.floorCode),
    wallPaint: null,
    ceilingHeight: null,
    origin: sourceOrigin(input.sourceId, room.ref),
  });
}

function wallsAndOpenings(
  input: FirstImportInput,
  scene: RectifiedScene,
): { readonly walls: HomeMapWall[]; readonly openings: HomeMapOpening[] } {
  const wallIds = new Map<string, string>();
  const walls = scene.walls.map((wall) => {
    const id = input.newId();
    wallIds.set(wall.ref, id);
    return HOME_MAP_WALL_WRITE.parse({
      id,
      from: wall.from,
      to: wall.to,
      thickness: wall.thickness,
      height: null,
      kind: wall.kind,
      origin: sourceOrigin(input.sourceId, wall.ref),
    });
  });
  const openings = scene.openings.map((opening) => {
    const wallId = wallIds.get(opening.wallRef);
    if (wallId === undefined) throw new Error(`opening ${opening.ref} points at a missing wall`);
    return HOME_MAP_OPENING_WRITE.parse({
      id: input.newId(),
      wallId,
      offset: opening.offset,
      width: opening.width,
      kind: opening.kind,
      sillHeight: DOOR_SILL_M,
      headHeight: DOOR_HEAD_M,
      hinge: 'left',
      swing: 'in',
      contactDeviceId: null,
      lockDeviceId: null,
      origin: sourceOrigin(input.sourceId, opening.ref),
    });
  });
  return { walls, openings };
}

function objectOf(
  input: FirstImportInput,
  fields: {
    readonly ref: string;
    readonly modelId: string;
    readonly ring: HomeMapRingShape;
    readonly label: string | null;
    readonly height: number | null;
  },
): HomeMapObject {
  const box = orientedBox(fields.ring);
  return HOME_MAP_OBJECT_WRITE.parse({
    id: input.newId(),
    modelId: fields.modelId,
    finish: null,
    params: {
      width: box.width,
      depth: box.depth,
      ...(fields.height === null ? {} : { height: fields.height }),
    },
    at: box.centre,
    rotation: box.rotationDeg,
    elevation: 0,
    label: fields.label,
    locked: false,
    origin: sourceOrigin(input.sourceId, fields.ref),
  });
}

function furnitureObject(
  input: FirstImportInput,
  item: RectifiedFurniture,
  index: number,
): HomeMapObject {
  return objectOf(input, {
    ref: `furniture:${String(index)}`,
    modelId: item.modelId ?? HOME_MAP_ROBOT_BOX_MODEL_ID,
    ring: item.ring,
    label: item.label,
    height: item.modelId === null ? item.height : null,
  });
}

function dockPlacement(
  input: FirstImportInput,
  dock: NonNullable<RectifiedScene['dock']>,
): HomeMapPlacement {
  return HOME_MAP_PLACEMENT_WRITE.parse({
    deviceId: input.deviceId,
    floorId: input.floorId,
    at: dock.at,
    rotation: dock.yawDeg,
    height: 0,
    tilt: 0,
    mount: 'floor',
    auto: false,
    camera: null,
  });
}

export function firstImport(input: FirstImportInput): FirstImportResult {
  const { geometry } = input;
  const transform = input.transform ?? estimateRectifyTransform(geometry);
  const scene = rectifyScene(geometry, transform);
  const { walls, openings } = wallsAndOpenings(input, scene);
  return {
    rooms: scene.rooms.map((room, index) => roomOf(input, room, index)),
    walls,
    openings,
    objects: [
      ...scene.carpets.map((ring, index) =>
        objectOf(input, {
          ref: `carpet:${String(index)}`,
          modelId: HOME_MAP_RUG_MODEL_ID,
          ring,
          label: null,
          height: null,
        }),
      ),
      ...scene.furniture.map((item, index) => furnitureObject(input, item, index)),
    ],
    placements: scene.dock ? [dockPlacement(input, scene.dock)] : [],
    source: HOME_MAP_SOURCE_WRITE.parse({
      id: input.sourceId,
      kind: input.sourceKind,
      deviceId: input.deviceId,
      floorId: input.floorId,
      transform: { ...transform },
      frame: geometry.frame,
      lastVersion: geometry.version,
      lastImportedAt: input.importedAt,
      base: {
        rooms: scene.rooms.map(({ ref, polygon, labelAt, floorCode }) => ({
          ref,
          polygon,
          labelAt,
          floorCode,
        })),
        walls: scene.walls,
        openings: scene.openings,
        carpets: scene.carpets,
        dock: scene.dock,
      },
      tombstones: [],
    }),
    skipped: scene.skipped,
  };
}
