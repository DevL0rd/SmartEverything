import type { VacuumPoint, VacuumScene } from '@smarteverything/domain';
import { z } from 'zod';
import { parseJson } from '../json';
import { VacuumCodecError } from './codecs';
import type { RestrictedArea, VirtualWall } from './codecs';
import { GRID_FIRST_ROOM, GRID_LAST_ROOM } from './map-blob';
import type { MapDocument } from './map-document';

const MILLIMETRES_PER_METRE = 1000;
const MINIMUM_RING_POINTS = 3;
const SAME_OPENING_CELLS = 2;
const OPENING_PROBE_CELLS = [-4, -3, 3, 4] as const;
const CARPET_PATTERN = /^(\d+)_(\d)\d+$/;
const CARPET_KINDS: Readonly<Record<string, string>> = { '1': 'user', '2': 'ai' };

export const WALL_LINE_TYPE = { exterior: 0, opening: 1, interior: 2 } as const;

export const WALL_KIND = { exterior: 'exterior', interior: 'interior' } as const;

export const OPENING_KIND = { opening: 'opening', sill: 'sill' } as const;

const FURNITURE_KINDS: Readonly<Record<number, string>> = {
  1100: 'single_bed',
  1110: 'double_bed',
  1120: 'tatami',
  1130: 'crib',
  1140: 'arhat_bed',
  1150: 'bunk_bed',
  1200: 'single_seat',
  1210: 'love_seat',
  1220: 'triple_seat',
  1230: 'l_seat_left',
  1240: 'l_seat_right',
  1250: 'lazy_sofa',
  1251: 'u_sofa',
  1300: 'nesting_table',
  1310: 'coffee_table',
  1400: 'dining_table',
  1410: 'desk',
  1420: 'rocking_chair',
  1430: 'small_stool',
  1440: 'child_seat',
  1450: 'baby_dining_chair',
  1461: 'round_table',
  1500: 'drawer',
  1510: 'shoe_cabinet',
  1520: 'nightstand',
  1530: 'tv_cabinet',
  1540: 'wardrobe',
  1550: 'bookshelf',
  1560: 'cabinet',
  1570: 'stove_cabinet',
  1580: 'sideboard',
  1582: 'oven_cabinet',
  1583: 'dishwasher_cabinet',
  1584: 'wash_basin',
  1600: 'refrigerator',
  1610: 'washing_machine',
  1620: 'vertical_air_conditioner',
  1630: 'air_purifier',
  1631: 'pedestal_fan',
  1634: 'humidifier',
  1635: 'heater',
  1636: 'dehumidifier',
  1700: 'cat_bed',
  1710: 'open_cat_litter_box',
  1720: 'pet_feeder',
  1730: 'pet_training_pad',
  1740: 'closed_cat_litter_box',
  1741: 'pet_cage',
  1742: 'cat_climber',
  1743: 'pet_water_dispenser',
  1745: 'pet_dryer',
  1800: 'green_plants',
  1810: 'toilet',
  1820: 'floor_mirror',
  1821: 'upright_piano',
  1822: 'grand_piano',
  1823: 'cylinder',
  1824: 'rectangular_prism',
  1825: 'trash_can',
};

const AI_OBJECT_KINDS: Readonly<Record<number, string>> = {
  3000: 'fabrics',
  3010: 'shoes',
  3020: 'cables',
  3030: 'base',
  3040: 'scales',
  3050: 'power_strips',
  3060: 'pet_waste',
  3070: 'plant_stem_and_leaf',
  3080: 'earbud',
  3090: 'bottle',
  3091: 'cup',
  3100: 'obstacle',
  3110: 'phone_case',
  3120: 'doorstop',
  3130: 'trash_can',
  3200: 'paper',
  3201: 'plastic_bag',
  3202: 'pen',
  3203: 'scissors',
  3204: 'toothpick',
  3205: 'jewelry',
  3206: 'paperclip',
  3207: 'book',
  3208: 'key',
  3209: 'battery',
  5000: 'liquid_dirt',
  5010: 'solid_dirt',
  5020: 'mixture',
  5030: 'stubborn_dirt',
  7000: 'summon',
};

const COORDINATES = z.array(z.number());

const HIDDEN_ZONE = z.object({ id: z.number().int(), points: COORDINATES.length(8) });

const HIDDEN_ZONES = z.union([
  z.object({ zones: z.array(HIDDEN_ZONE) }).transform((read) => read.zones),
  z.object({ zone: z.array(HIDDEN_ZONE) }).transform((read) => read.zone),
]);

const SILLS = z.object({
  map_sills: z.array(z.object({ id: z.number().int(), sill_points: COORDINATES.length(4) })),
});

const FURNITURE = z.array(
  z.object({ id: z.number().int(), type: z.number().int(), pos: COORDINATES.length(8) }),
);

const AI_OBJECTS = z.array(
  z.object({
    id: z.number().int(),
    type: z.number().int(),
    pos_x: z.number(),
    pos_y: z.number(),
  }),
);

export type HiddenZone = z.infer<typeof HIDDEN_ZONE>;
export type Sill = z.infer<typeof SILLS>['map_sills'][number];
export type FurnitureItem = z.infer<typeof FURNITURE>[number];
export type AiObject = z.infer<typeof AI_OBJECTS>[number];

export interface PushedMapObjects {
  readonly restrictedAreas: readonly RestrictedArea[];
  readonly virtualWalls: readonly VirtualWall[];
  readonly hiddenZones: readonly HiddenZone[];
  readonly sills: readonly Sill[];
  readonly furniture: readonly FurnitureItem[];
  readonly aiObjects: readonly AiObject[];
}

export const NO_PUSHED_MAP_OBJECTS: PushedMapObjects = {
  restrictedAreas: [],
  virtualWalls: [],
  hiddenZones: [],
  sills: [],
  furniture: [],
  aiObjects: [],
};

export type WallsLayer = Pick<
  VacuumScene,
  'walls' | 'doors' | 'carpets' | 'furniture' | 'objects' | 'zones'
>;

type Wall = VacuumScene['walls'][number];
type Door = VacuumScene['doors'][number];
type Line = NonNullable<NonNullable<MapDocument['map_3d_info']>['rooms']>[number]['lines'][number];

function readPushed<T>(codec: string, expected: string, schema: z.ZodType<T>, text: string): T {
  const raw = parseJson(text, () => new VacuumCodecError(codec, expected, 'text that is not JSON'));
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new VacuumCodecError(codec, expected, result.error.issues[0]?.message ?? 'another shape');
  }
  return result.data;
}

export function decodeHiddenZones(text: string): readonly HiddenZone[] {
  return readPushed('hidden zones 2.103', '{"zones":[...]} or {"zone":[...]}', HIDDEN_ZONES, text);
}

export function decodeSills(text: string): readonly Sill[] {
  return readPushed('sills 2.99', '{"map_sills":[...]}', SILLS, text).map_sills;
}

export function decodeFurniture(text: string): readonly FurnitureItem[] {
  return readPushed('furniture 2.57', '[{"id","type","pos":[8 numbers]}]', FURNITURE, text);
}

export function decodeAiObjects(text: string): readonly AiObject[] {
  return readPushed('AI objects 2.56', '[{"id","type","pos_x","pos_y"}]', AI_OBJECTS, text);
}

function metres(value: number): number {
  return value / MILLIMETRES_PER_METRE;
}

function pointsOf(coordinates: readonly number[]): VacuumPoint[] {
  const points: VacuumPoint[] = [];
  for (let index = 0; index + 1 < coordinates.length; index += 2) {
    points.push({ x: metres(coordinates[index] ?? 0), y: metres(coordinates[index + 1] ?? 0) });
  }
  return points;
}

function mapLines(map: MapDocument): readonly (Line & { readonly roomId: number })[] {
  return (map.map_3d_info?.rooms ?? []).flatMap((room) =>
    room.lines.map((line) => ({ ...line, roomId: room.room_id })),
  );
}

function segmentOf(coordinates: readonly number[]): Pick<Wall, 'from' | 'to'> {
  const [from, to] = pointsOf(coordinates);
  return { from: from ?? { x: 0, y: 0 }, to: to ?? { x: 0, y: 0 } };
}

export function buildWalls(map: MapDocument): Wall[] {
  return mapLines(map).flatMap((line): Wall[] => {
    if (line.type === WALL_LINE_TYPE.exterior) {
      return [{ ...segmentOf(line.segment), kind: WALL_KIND.exterior, height: null }];
    }
    if (line.type === WALL_LINE_TYPE.interior) {
      return [{ ...segmentOf(line.segment), kind: WALL_KIND.interior, height: null }];
    }
    return [];
  });
}

function roomAt(map: MapDocument, cells: Uint8Array, x: number, y: number): number | null {
  const column = Math.floor((x - map.origin_x) / map.resolution);
  const row = Math.floor((y - map.origin_y) / map.resolution);
  if (column < 0 || column >= map.width || row < 0 || row >= map.height) return null;
  const value = cells[row * map.width + column];
  return value !== undefined && value >= GRID_FIRST_ROOM && value <= GRID_LAST_ROOM ? value : null;
}

function roomsBesideLine(
  map: MapDocument,
  cells: Uint8Array,
  segment: readonly number[],
): number[] {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = segment;
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length === 0) return [];
  const normalX = (-(y2 - y1) / length) * map.resolution;
  const normalY = ((x2 - x1) / length) * map.resolution;
  const found = new Set<number>();
  for (const away of OPENING_PROBE_CELLS) {
    const room = roomAt(map, cells, (x1 + x2) / 2 + normalX * away, (y1 + y2) / 2 + normalY * away);
    if (room !== null) found.add(room);
  }
  return [...found].toSorted((a, b) => a - b);
}

function midpoint(door: Door): VacuumPoint {
  return { x: (door.from.x + door.to.x) / 2, y: (door.from.y + door.to.y) / 2 };
}

function sameOpening(map: MapDocument, kept: Door, candidate: Door): boolean {
  if (kept.rooms.join() !== candidate.rooms.join()) return false;
  const a = midpoint(kept);
  const b = midpoint(candidate);
  return Math.hypot(a.x - b.x, a.y - b.y) <= metres(map.resolution * SAME_OPENING_CELLS);
}

export function buildDoors(map: MapDocument, cells: Uint8Array): Door[] {
  const doors: Door[] = [];
  for (const line of mapLines(map)) {
    if (line.type !== WALL_LINE_TYPE.opening) continue;
    const door: Door = {
      ...segmentOf(line.segment),
      kind: OPENING_KIND.opening,
      rooms: roomsBesideLine(map, cells, line.segment),
    };
    if (!doors.some((kept) => sameOpening(map, kept, door))) doors.push(door);
  }
  return doors;
}

export function buildSills(sills: readonly Sill[]): Door[] {
  return sills.map((sill) => ({
    ...segmentOf(sill.sill_points),
    kind: OPENING_KIND.sill,
    rooms: [],
  }));
}

export function buildCarpets(map: MapDocument): VacuumScene['carpets'] {
  return (map.carpets ?? []).flatMap((carpet, index) => {
    const ring = pointsOf(carpet.p);
    if (ring.length < MINIMUM_RING_POINTS) return [];
    const parsed = CARPET_PATTERN.exec(carpet.d);
    return [
      {
        id: parsed?.[1] === undefined ? index : Number(parsed[1]),
        kind: CARPET_KINDS[parsed?.[2] ?? ''] ?? 'unknown',
        ring,
      },
    ];
  });
}

export function buildZones(pushed: PushedMapObjects): VacuumScene['zones'] {
  return [
    ...pushed.restrictedAreas.map((area) => ({
      id: area.id,
      kind: area.kind === 'no-go' ? 'no_go' : 'no_mop',
      points: pointsOf(area.corners),
    })),
    ...pushed.virtualWalls.map((wall) => ({
      id: wall.id,
      kind: 'wall',
      points: pointsOf(wall.points),
    })),
    ...pushed.hiddenZones.map((zone) => ({
      id: zone.id,
      kind: 'hidden',
      points: pointsOf(zone.points),
    })),
  ];
}

export function buildFurniture(items: readonly FurnitureItem[]): VacuumScene['furniture'] {
  return items.flatMap((item) => {
    const ring = pointsOf(item.pos);
    if (ring.length < MINIMUM_RING_POINTS) return [];
    return [
      {
        id: item.id,
        kind: FURNITURE_KINDS[item.type] ?? `furniture_${String(item.type)}`,
        ring,
        height: null,
      },
    ];
  });
}

function humanise(kind: string): string {
  const words = kind.replaceAll('_', ' ');
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
}

export function buildObjects(items: readonly AiObject[]): VacuumScene['objects'] {
  return items.map((item) => {
    const kind = AI_OBJECT_KINDS[item.type];
    return {
      id: item.id,
      kind: kind ?? `object_${String(item.type)}`,
      at: { x: metres(item.pos_x), y: metres(item.pos_y) },
      label: kind === undefined ? null : humanise(kind),
    };
  });
}

export function buildWallsLayer(
  map: MapDocument,
  cells: Uint8Array,
  pushed: PushedMapObjects,
): WallsLayer {
  return {
    walls: buildWalls(map),
    doors: [...buildDoors(map, cells), ...buildSills(pushed.sills)],
    carpets: buildCarpets(map),
    furniture: buildFurniture(pushed.furniture),
    objects: buildObjects(pushed.aiObjects),
    zones: buildZones(pushed),
  };
}
