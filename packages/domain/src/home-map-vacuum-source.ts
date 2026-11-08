import { z } from 'zod';
import { HOME_MAP_POINT, HOME_MAP_RING, type HomeMapPoint } from './home-map-elements';
import { homeMapPointInPolygon, homeMapRingArea, type HomeMapRingShape } from './home-map-geometry';
import type { VacuumPoint, VacuumRoom, VacuumScene, VacuumSlot } from './vacuum-scene';
import { vacuumSceneVersion } from './vacuum-scene';
import { isVacuumTaskPhase, type VacuumPhase } from './vacuum-status';

const SEGMENT = z.looseObject({ from: HOME_MAP_POINT, to: HOME_MAP_POINT });
const PART = z.looseObject({ ring: HOME_MAP_RING, holes: z.array(HOME_MAP_RING) });

export const HOME_MAP_SOURCE_GEOMETRY = z.looseObject({
  version: z.string().min(1),
  frame: z.looseObject({
    uid: z.string().min(1).nullable(),
    name: z.string().nullable(),
    boundsSignature: z.string().min(1),
  }),
  rooms: z.array(
    PART.extend({
      ref: z.string().min(1),
      name: z.string().nullable(),
      labelAt: HOME_MAP_POINT,
      floorCode: z.number().int().nullable(),
      hidden: z.boolean(),
      extraParts: z.array(PART),
    }),
  ),
  walls: z.array(SEGMENT.extend({ kind: z.string(), height: z.number().nonnegative().nullable() })),
  doors: z.array(SEGMENT.extend({ kind: z.string(), rooms: z.array(z.string().min(1)) })),
  carpets: z.array(HOME_MAP_RING),
  furniture: z.array(
    z.looseObject({
      kind: z.string().min(1),
      label: z.string().min(1),
      modelId: z.string().min(1).nullable(),
      ring: HOME_MAP_RING,
      height: z.number().nonnegative().nullable(),
    }),
  ),
  dock: z.looseObject({ x: z.number(), y: z.number(), yaw: z.number() }).nullable(),
});

export type HomeMapSourceGeometry = z.infer<typeof HOME_MAP_SOURCE_GEOMETRY>;

export const HOME_MAP_VACUUM_CAPABILITIES = {
  rooms: true,
  walls: true,
  doors: true,
  carpets: true,
  furniture: true,
  livePose: true,
  zones: true,
} as const;

const ROBOT_FLOORS = [
  { code: 4000, kind: 'tile', variant: null },
  { code: 4010, kind: 'wood', variant: null },
  { code: 4011, kind: 'wood', variant: 'horizontal' },
  { code: 4020, kind: 'stone', variant: 'cobblestone' },
  { code: 4030, kind: 'marble', variant: null },
] as const;

const NO_ROBOT_FLOOR = 0;

export type HomeMapRobotFloor =
  | { readonly status: 'none' }
  | {
      readonly status: 'known';
      readonly code: number;
      readonly kind: string;
      readonly variant: string | null;
    }
  | { readonly status: 'unknown'; readonly code: number; readonly label: string };

export function homeMapRobotFloor(code: number): HomeMapRobotFloor {
  if (code === NO_ROBOT_FLOOR) return { status: 'none' };
  const known = ROBOT_FLOORS.find((floor) => floor.code === code);
  if (known !== undefined) return { status: 'known', ...known };
  return { status: 'unknown', code, label: `Robot floor type ${String(code)}` };
}

export function homeMapRobotFloorCode(material: {
  readonly kind: string;
  readonly variant: string | null;
}): number | null {
  const match = ROBOT_FLOORS.find(
    (floor) => floor.kind === material.kind && floor.variant === material.variant,
  );
  return match === undefined ? null : match.code;
}

const FURNITURE_MODELS: Readonly<Record<string, string>> = {
  single_bed: 'cat.bedroom.single-bed',
  double_bed: 'cat.bedroom.queen-bed',
  crib: 'cat.bedroom.crib',
  bunk_bed: 'cat.bedroom.bunk-bed',
  single_seat: 'cat.living.armchair',
  love_seat: 'cat.living.sofa-2-seat',
  triple_seat: 'cat.living.sofa-3-seat',
  l_seat_left: 'cat.living.sectional-l',
  l_seat_right: 'cat.living.sectional-l',
  lazy_sofa: 'cat.living.bean-bag',
  nesting_table: 'cat.living.side-table',
  coffee_table: 'cat.living.coffee-table-rectangle',
  dining_table: 'cat.dining.dining-table-rectangle',
  round_table: 'cat.dining.dining-table-round',
  desk: 'cat.office.desk',
  small_stool: 'cat.living.pouf',
  drawer: 'cat.bedroom.dresser',
  shoe_cabinet: 'cat.storage.shoe-rack',
  nightstand: 'cat.bedroom.nightstand',
  tv_cabinet: 'cat.living.tv-console',
  wardrobe: 'cat.bedroom.wardrobe',
  bookshelf: 'cat.living.bookshelf',
  cabinet: 'cat.living.display-cabinet',
  stove_cabinet: 'cat.kitchen.base-cabinet-run',
  dishwasher_cabinet: 'cat.kitchen.base-cabinet-run',
  oven_cabinet: 'cat.kitchen.oven-column',
  sideboard: 'cat.dining.sideboard',
  wash_basin: 'cat.bathroom.vanity-with-sink',
  refrigerator: 'cat.kitchen.fridge-enclosure',
  green_plants: 'cat.plants.monstera',
  toilet: 'cat.bathroom.toilet',
  floor_mirror: 'cat.bedroom.floor-mirror',
  upright_piano: 'cat.living.upright-piano',
};

export function homeMapRobotFurnitureModel(kind: string): string | null {
  return FURNITURE_MODELS[kind] ?? null;
}

export const HOME_MAP_ROBOT_FURNITURE_MODEL_IDS: readonly string[] = [
  ...new Set(Object.values(FURNITURE_MODELS)),
];

function furnitureLabel(kind: string): string {
  const words = kind.replaceAll('_', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function isHomeMapVacuumSettled(state: {
  readonly slot: VacuumSlot;
  readonly phase: VacuumPhase | null;
}): boolean {
  if (state.slot !== 'current') return true;
  return state.phase !== null && !isVacuumTaskPhase(state.phase);
}

const point = (source: VacuumPoint): HomeMapPoint => ({ x: source.x, y: source.y });

const ringOf = (source: readonly VacuumPoint[]): HomeMapPoint[] => source.map(point);

const signedArea = (ring: HomeMapRingShape): number =>
  ring.reduce((sum, current, index) => {
    const next = ring[(index + 1) % ring.length];
    return next === undefined ? sum : sum + current.x * next.y - next.x * current.y;
  }, 0) / 2;

type RoomPart = z.infer<typeof PART>;

function partsOf(rings: readonly (readonly VacuumPoint[])[]): RoomPart[] {
  const shaped = rings.map(ringOf);
  const parts: RoomPart[] = shaped
    .filter((ring) => signedArea(ring) > 0)
    .sort((a, b) => homeMapRingArea(b) - homeMapRingArea(a))
    .map((ring) => ({ ring, holes: [] }));
  for (const hole of shaped.filter((ring) => signedArea(ring) < 0)) {
    const first = hole[0];
    const owner = parts
      .filter(
        (part) =>
          first !== undefined && homeMapPointInPolygon({ outer: part.ring, holes: [] }, first),
      )
      .at(-1);
    owner?.holes.push(hole);
  }
  return parts;
}

function roomOf(room: VacuumRoom): HomeMapSourceGeometry['rooms'][number] | null {
  const [main, ...rest] = partsOf(room.rings);
  if (main === undefined) return null;
  return {
    ref: String(room.id),
    name: room.name,
    ring: main.ring,
    holes: main.holes,
    extraParts: rest,
    labelAt: point(room.label),
    floorCode: room.floor,
    hidden: room.hidden,
  };
}

const centimetres = (metres: number): string => (Math.round(metres * 100) / 100).toFixed(2);

function boundsSignature(bounds: VacuumScene['bounds']): string {
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map(centimetres).join(',');
}

export function vacuumSceneToSourceGeometry(scene: VacuumScene): HomeMapSourceGeometry {
  return {
    version: vacuumSceneVersion(scene),
    frame: { uid: null, name: scene.name, boundsSignature: boundsSignature(scene.bounds) },
    rooms: scene.rooms.flatMap((room) => roomOf(room) ?? []),
    walls: scene.walls.map((wall) => ({
      from: point(wall.from),
      to: point(wall.to),
      kind: wall.kind,
      height: wall.height,
    })),
    doors: scene.doors.map((door) => ({
      from: point(door.from),
      to: point(door.to),
      kind: door.kind,
      rooms: door.rooms.map(String),
    })),
    carpets: scene.carpets.map((carpet) => ringOf(carpet.ring)),
    furniture: scene.furniture.map((item) => ({
      kind: item.kind,
      label: furnitureLabel(item.kind),
      modelId: homeMapRobotFurnitureModel(item.kind),
      ring: ringOf(item.ring),
      height: item.height,
    })),
    dock: scene.dock === null ? null : { x: scene.dock.x, y: scene.dock.y, yaw: scene.dock.yaw },
  };
}
