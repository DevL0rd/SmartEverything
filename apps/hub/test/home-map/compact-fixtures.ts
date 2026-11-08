import {
  HOME_MAP_SCHEMA_VERSION,
  HOME_MAP_WRITE,
  type HomeMap,
  type HomeMapFloor,
} from '@smarteverything/domain';

export const NOW = '2026-10-25T10:00:00.000Z';

export const ROOM_WIDTH = 5;
export const ROOM_DEPTH = 4;
const COLUMNS = 5;
const ORIGIN = { kind: 'hand' } as const;

const NAMES = [
  'Hall',
  'Living room',
  'Kitchen',
  'Dining room',
  'Study',
  'Bedroom',
  'Nursery',
  'Bathroom',
  'Laundry',
  'Garage',
] as const;

const ring = (x: number, y: number): readonly { readonly x: number; readonly y: number }[] => [
  { x, y },
  { x: x + ROOM_WIDTH, y },
  { x: x + ROOM_WIDTH, y: y + ROOM_DEPTH },
  { x, y: y + ROOM_DEPTH },
];

const roomAt = (index: number): Record<string, unknown> => {
  const x = (index % COLUMNS) * ROOM_WIDTH;
  const y = Math.floor(index / COLUMNS) * ROOM_DEPTH;
  return {
    id: `room-${String(index)}`,
    name: NAMES[index] ?? null,
    homeRoomId: null,
    polygon: { outer: ring(x, y), holes: [] },
    labelAt: { x: x + ROOM_WIDTH / 2, y: y + ROOM_DEPTH / 2 },
    colourSlot: (index % 8) + 1,
    floorMaterial: { kind: 'wood', variant: 'oak', tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: ORIGIN,
  };
};

const wallsOf = (index: number): readonly Record<string, unknown>[] => {
  const corners = ring((index % COLUMNS) * ROOM_WIDTH, Math.floor(index / COLUMNS) * ROOM_DEPTH);
  return corners.map((from, side) => ({
    id: `wall-${String(index)}-${String(side)}`,
    from,
    to: corners[(side + 1) % corners.length],
    thickness: 0.1,
    height: null,
    kind: 'solid',
    origin: ORIGIN,
  }));
};

const openingOf = (index: number): Record<string, unknown> => ({
  id: `door-${String(index)}`,
  wallId: `wall-${String(index)}-0`,
  offset: 1,
  width: 0.9,
  kind: 'door',
  sillHeight: 0,
  headHeight: 2.1,
  hinge: 'left',
  swing: 'in',
  contactDeviceId: null,
  lockDeviceId: null,
  origin: ORIGIN,
});

export const objectAt = (
  id: string,
  modelId: string,
  at: { readonly x: number; readonly y: number },
  label: string | null = null,
): Record<string, unknown> => ({
  id,
  modelId,
  finish: null,
  params: {},
  at,
  rotation: 0,
  elevation: 0,
  label,
  locked: false,
  origin: ORIGIN,
});

export const placementAt = (
  deviceId: string,
  at: { readonly x: number; readonly y: number },
  mount: 'floor' | 'wall' | 'ceiling' | 'table' = 'floor',
  height = 0,
): Record<string, unknown> => ({
  deviceId,
  floorId: 'ground',
  at,
  rotation: 0,
  height,
  tilt: 0,
  mount,
  auto: true,
  camera: null,
});

export const deviceId = (index: number): string =>
  `3f2b8c1e-5d4a-4b6f-9a77-${String(index).padStart(12, '0')}`;

const furnitureOf = (index: number): readonly Record<string, unknown>[] => {
  const x = (index % COLUMNS) * ROOM_WIDTH;
  const y = Math.floor(index / COLUMNS) * ROOM_DEPTH;
  return [
    objectAt(`sofa-${String(index)}`, 'cat.seating.sofa_three', { x: x + 2.5, y: y + 0.6 }),
    objectAt(`table-${String(index)}`, 'cat.tables.coffee_table', { x: x + 2.5, y: y + 2 }),
    objectAt(`shelf-${String(index)}`, 'cat.storage.bookcase', { x: x + 0.4, y: y + 2 }),
  ];
};

const placementsOf = (index: number): readonly Record<string, unknown>[] => {
  const x = (index % COLUMNS) * ROOM_WIDTH;
  const y = Math.floor(index / COLUMNS) * ROOM_DEPTH;
  return [
    placementAt(deviceId(index * 2), { x: x + 2.5, y: y + 2 }, 'ceiling', 2.6),
    placementAt(deviceId(index * 2 + 1), { x: x + 0.3, y: y + 1 }, 'wall', 1.2),
  ];
};

export const houseFloor = (roomCount: number): Record<string, unknown> => {
  const indexes = Array.from({ length: roomCount }, (_, index) => index);
  return {
    id: 'ground',
    name: 'Ground floor',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    rooms: indexes.map(roomAt),
    walls: indexes.flatMap(wallsOf),
    openings: indexes.map(openingOf),
    objects: indexes.flatMap(furnitureOf),
    placements: indexes.flatMap(placementsOf),
    annotations: [],
  };
};

export const mapOf = (floors: readonly Record<string, unknown>[], north = 0): HomeMap =>
  HOME_MAP_WRITE.parse({
    id: 'home',
    schemaVersion: HOME_MAP_SCHEMA_VERSION,
    revision: 7,
    name: 'Test house',
    north,
    updatedAt: NOW,
    floors,
    sources: [],
    notices: [],
  });

export const tenRoomHouse = (): HomeMap => mapOf([houseFloor(NAMES.length)]);

export const floorOf = (map: HomeMap): HomeMapFloor => {
  const [floor] = map.floors;
  if (floor === undefined) throw new Error('fixture has no floor');
  return floor;
};
