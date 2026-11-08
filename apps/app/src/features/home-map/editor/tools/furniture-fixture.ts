import {
  HOME_MAP_WRITE,
  MODEL_SPEC,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapObject,
  type ModelCatalogRow,
  type ModelSpec,
} from '@smarteverything/domain';
import { NO_EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { Manipulation } from '../manipulate/use-manipulation';
import type { DeviceRoomFlow } from './device-room-flow';

export const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';
export const BIG = '00000000-0000-4000-8000-00000000000a';
export const SMALL = '00000000-0000-4000-8000-00000000000b';
export const SOFA_ID = '00000000-0000-4000-8000-0000000000c1';
const VIEW = { yaw: 0, pitch: 0, fov: 30, padding: 0.1 } as const;

export const SOFA: ModelSpec = MODEL_SPEC.parse({
  schema: 1,
  id: 'cat.living.sofa',
  version: '1.0.0',
  title: 'Sofa',
  category: 'living',
  footprint: { width: 2, depth: 0.9, height: 0.8 },
  size: { width: { param: 'width', extra: 0, resizes: true } },
  framing: { tile: VIEW, card: VIEW, hero: VIEW },
  params: {
    width: { min: 1.6, max: 3, default: 2, unit: 'm' },
    seats: { min: 2, max: 4, default: 3, unit: 'count' },
  },
  materials: { body: { finish: 'matte-white' } },
  finishes: {
    oat: { body: { finish: 'matte-white' } },
    slate: { body: { finish: 'matte-white' } },
  },
  defaultFinish: 'oat',
  parts: [
    {
      id: 'base',
      geometry: {
        type: 'roundedBox',
        width: 2,
        height: 0.4,
        depth: 0.9,
        radius: 0.02,
        segments: 4,
      },
      material: 'body',
    },
  ],
  anchors: [{ kind: 'mount', id: 'floor', position: [0, 0, 0], mount: 'floor' }],
});

export const SHELF: ModelSpec = MODEL_SPEC.parse({
  schema: 1,
  id: 'cat.decor.shelf',
  version: '1.0.0',
  title: 'Wall shelf',
  category: 'decor',
  footprint: { width: 1, depth: 0.25, height: 0.3 },
  framing: { tile: VIEW, card: VIEW, hero: VIEW },
  materials: { body: { finish: 'matte-white' } },
  parts: [
    {
      id: 'board',
      geometry: {
        type: 'roundedBox',
        width: 1,
        height: 0.03,
        depth: 0.25,
        radius: 0.005,
        segments: 3,
      },
      material: 'body',
    },
  ],
  anchors: [{ kind: 'mount', id: 'wall', position: [0, 0, 0], mount: 'wall' }],
});

export const LAMP: ModelSpec = MODEL_SPEC.parse({
  schema: 1,
  id: 'cat.decor.table-lamp',
  version: '1.0.0',
  title: 'Table lamp',
  category: 'decor',
  footprint: { width: 0.3, depth: 0.3, height: 0.5 },
  framing: { tile: VIEW, card: VIEW, hero: VIEW },
  materials: { body: { finish: 'matte-white' } },
  parts: [
    {
      id: 'body',
      geometry: {
        type: 'roundedBox',
        width: 0.3,
        height: 0.5,
        depth: 0.3,
        radius: 0.005,
        segments: 3,
      },
      material: 'body',
    },
  ],
  anchors: [{ kind: 'mount', id: 'table', position: [0, 0, 0], mount: 'desk' }],
});

export function row(
  id: string,
  title: string,
  category: string,
  aliases: string[] = [],
): ModelCatalogRow {
  return {
    id,
    version: '1.0.0',
    owner: 'builtin',
    title,
    category,
    match: { exact: [], prefix: [], normalised: [], product: [], hardwareModel: [], families: [] },
    brands: [],
    aliases,
    extras: [],
    spec_sha256: 'a'.repeat(64),
  };
}

function square(id: string, x: number, size: number): Record<string, unknown> {
  return {
    id,
    name: id === BIG ? 'Living room' : 'Closet',
    homeRoomId: null,
    polygon: {
      outer: [
        { x, y: 0 },
        { x: x + size, y: 0 },
        { x: x + size, y: size },
        { x, y: size },
      ],
      holes: [],
    },
    labelAt: { x: x + size / 2, y: size / 2 },
    colourSlot: 1,
    floorMaterial: { kind: 'tile', variant: 'small', tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
  };
}

export function sofa(locked = false): Record<string, unknown> {
  return {
    id: SOFA_ID,
    modelId: 'cat.living.sofa',
    finish: null,
    params: {},
    at: { x: 2, y: 2 },
    rotation: 0,
    elevation: 0,
    label: null,
    locked,
    origin: { kind: 'hand' },
  };
}

export const WALL_ID = 'wall-south';

export function southDoor(offset: number, width: number): Record<string, unknown>[] {
  return [
    {
      id: 'door-south',
      wallId: WALL_ID,
      offset,
      width,
      kind: 'door',
      sillHeight: 0,
      headHeight: 2,
      hinge: 'left',
      swing: 'in',
      contactDeviceId: null,
      lockDeviceId: null,
      origin: { kind: 'hand' },
    },
  ];
}

const SOUTH_WALL = {
  id: WALL_ID,
  from: { x: 0, y: 0 },
  to: { x: 5, y: 0 },
  thickness: 0.1,
  height: null,
  kind: 'solid',
  origin: { kind: 'hand' },
};

export function floorWith(
  objects: Record<string, unknown>[],
  openings: Record<string, unknown>[] = [],
): HomeMapFloor {
  const map: HomeMap = HOME_MAP_WRITE.parse({
    schemaVersion: 1,
    id: 'home',
    name: 'Test house',
    revision: 1,
    updatedAt: '2026-10-25T00:00:00.000Z',
    north: 0,
    floors: [
      {
        id: FLOOR_ID,
        name: 'Ground',
        level: 0,
        elevation: 0,
        ceilingHeight: 2.6,
        rooms: [square(SMALL, 10, 0.6), square(BIG, 0, 5)],
        walls: [SOUTH_WALL],
        openings,
        objects,
        placements: [],
        annotations: [],
      },
    ],
    sources: [],
    notices: [],
  });
  const floor = map.floors[0];
  if (floor === undefined) throw new Error('no floor');
  return floor;
}

export const specOf = (id: string): ModelSpec | undefined => (id === SOFA.id ? SOFA : undefined);

export function onlyObject(floor: HomeMapFloor): HomeMapObject {
  const object = floor.objects[0];
  if (object === undefined) throw new Error('no object');
  return object;
}

const nothing = (): void => undefined;

export function idleRoomFlow(): DeviceRoomFlow {
  return {
    ...{ pending: null, moved: null, note: null, readOnly: false },
    ...{ place: nothing, moveTo: nothing, apply: nothing, run: nothing, show: nothing },
    ...{ confirmMove: nothing, keep: nothing, undoMove: nothing, dismiss: nothing },
  };
}

export function idleManipulation(): Manipulation {
  return {
    gizmo: { mode: 'move', space: 'local', snapping: true, owner: null },
    modes: [],
    locked: false,
    overlay: { ...NO_EDIT_OVERLAY, mode: 'select' },
    notice: null,
    ...{ setMode: nothing, toggleSnapping: nothing, toggleSpace: nothing, onEdit: nothing },
  };
}
