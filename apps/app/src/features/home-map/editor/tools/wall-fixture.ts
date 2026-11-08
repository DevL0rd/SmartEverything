import {
  HOME_MAP_WALL_ATTACHMENT_WRITE,
  HOME_MAP_WRITE,
  MODEL_SPEC,
  type HomeMapFloor,
  type HomeMapWallAttachment,
  type ModelCatalogRow,
  type ModelSpec,
} from '@smarteverything/domain';

export const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';
export const BIG = '00000000-0000-4000-8000-00000000000a';
export const BOTTOM = '00000000-0000-4000-8000-0000000000d1';
export const RIGHT = '00000000-0000-4000-8000-0000000000d2';
export const SHELF_ID = '00000000-0000-4000-8000-0000000000c2';
const VIEW = { yaw: 0, pitch: 0, fov: 30, padding: 0.1 } as const;

function spec(id: string, title: string, mount: 'wall' | 'floor', size: number[]): ModelSpec {
  const [width = 1, height = 1, depth = 1] = size;
  return MODEL_SPEC.parse({
    ...{ schema: 1, id, version: '1.0.0', title, category: 'decor' },
    footprint: { width, depth, height },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'body',
        geometry: { type: 'roundedBox', width, height, depth, radius: 0.005, segments: 4 },
        material: 'body',
      },
    ],
    anchors: [{ kind: 'mount', id: mount, position: [0, 0, 0], mount }],
  });
}

export const SHELF = spec('cat.decor.floating-shelf', 'Floating shelf', 'wall', [0.8, 0.3, 0.25]);
export const VASE = spec('cat.decor.vase', 'Vase', 'floor', [0.3, 0.5, 0.3]);

export function row(id: string, title: string, hash: string): ModelCatalogRow {
  const match = { exact: [], prefix: [], normalised: [], product: [], hardwareModel: [] };
  return {
    ...{ id, version: '1.0.0', owner: 'builtin', title, category: 'decor' },
    ...{ match: { ...match, families: [] }, brands: [], aliases: [], extras: [] },
    ...{ spec_sha256: hash.repeat(64) },
  };
}

export function shelf(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...{ id: SHELF_ID, modelId: SHELF.id, finish: null, params: {} },
    ...{ at: { x: 2, y: 0.175 }, rotation: 90, elevation: 1.6, label: null, locked: false },
    origin: { kind: 'hand' },
    ...extra,
  };
}

export const ATTACHED: HomeMapWallAttachment = HOME_MAP_WALL_ATTACHMENT_WRITE.parse({
  wallId: BOTTOM,
  offset: 2,
  side: 'left',
});

function wall(id: string, from: object, to: object): Record<string, unknown> {
  return { id, from, to, thickness: 0.1, height: 2.5, kind: 'solid', origin: { kind: 'hand' } };
}

const ROOM = {
  ...{ id: BIG, name: 'Living room', homeRoomId: null, colourSlot: 1 },
  polygon: {
    outer: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ],
    holes: [],
  },
  ...{ labelAt: { x: 2.5, y: 2.5 }, wallPaint: null, ceilingHeight: null },
  ...{ floorMaterial: { kind: 'tile', variant: null, tint: null }, origin: { kind: 'hand' } },
};

export function wallFloor(objects: Record<string, unknown>[] = []): HomeMapFloor {
  const walls = [
    wall(BOTTOM, { x: 0, y: 0 }, { x: 5, y: 0 }),
    wall(RIGHT, { x: 5, y: 0 }, { x: 5, y: 5 }),
  ];
  const map = HOME_MAP_WRITE.parse({
    ...{ schemaVersion: 1, id: 'home', name: 'Test house', revision: 1, north: 0 },
    updatedAt: '2026-10-25T00:00:00.000Z',
    floors: [
      {
        ...{ id: FLOOR_ID, name: 'Ground', level: 0, elevation: 0, ceilingHeight: 2.6 },
        ...{ rooms: [ROOM], walls, openings: [], objects, placements: [], annotations: [] },
      },
    ],
    sources: [],
    notices: [],
  });
  const floor = map.floors[0];
  if (floor === undefined) throw new Error('no floor');
  return floor;
}

export const wallSpecOf = (id: string): ModelSpec | undefined =>
  id === SHELF.id ? SHELF : id === VASE.id ? VASE : undefined;
