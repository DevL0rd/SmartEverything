import { describe, expect, it } from 'vitest';
import {
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_WALL_WRITE,
  HOME_MAP_WRITE,
  applyHomeMapEdits,
  type HomeMap,
  type HomeMapRoom,
  type HomeMapWall,
} from '@smarteverything/domain';
import { FLOOR_PATTERNS, floorLookOf } from '../../../../components/house-map/3d/floor-looks';
import { FINISH_TOKENS } from '../../../../components/models/three/materials';
import {
  CEILING_HINT,
  FLOOR_CHOICES,
  FLOOR_TINTS,
  INITIAL_FINISH,
  WALL_CHOICES,
  WALL_PAINTS,
  finishNotice,
  finishOverlay,
  floorCeilingOps,
  floorChoiceId,
  floorMaterialOps,
  matchRoomOps,
  paintOps,
  paintedRoom,
  patternPath,
  roomCeilingOps,
  tintOps,
  wallPaintOps,
} from './materials-model';

const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';

function room(id: string, name: string, left = 0): HomeMapRoom {
  return HOME_MAP_ROOM_WRITE.parse({
    id,
    name,
    homeRoomId: null,
    polygon: {
      outer: [
        { x: left, y: 0 },
        { x: left + 3, y: 0 },
        { x: left + 3, y: 3 },
        { x: left, y: 3 },
      ],
      holes: [],
    },
    labelAt: { x: 1.5, y: 1.5 },
    colourSlot: 1,
    floorMaterial: { kind: 'tile', variant: 'small', tint: '#112233' },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
  });
}

const KITCHEN = room('00000000-0000-4000-8000-00000000000a', 'Kitchen');
const HALL = room('00000000-0000-4000-8000-00000000000b', 'Hall');

const MAP: HomeMap = HOME_MAP_WRITE.parse({
  schemaVersion: 1,
  id: 'home',
  name: 'Test house',
  revision: 3,
  updatedAt: '2026-10-25T00:00:00.000Z',
  north: 0,
  floors: [
    {
      id: FLOOR_ID,
      name: 'Ground',
      level: 0,
      elevation: 0,
      ceilingHeight: 2.6,
      rooms: [KITCHEN, HALL],
      walls: [],
      openings: [],
      objects: [],
      placements: [],
      annotations: [],
    },
  ],
  sources: [],
  notices: [],
});

function apply(ops: Parameters<typeof applyHomeMapEdits>[1]): HomeMap {
  const result = applyHomeMapEdits(MAP, ops, { actor: 'profile:test', at: MAP.updatedAt });
  expect(result.conflicts).toEqual([]);
  return result.map;
}

const GROUND = MAP.floors[0];
if (GROUND === undefined) throw new Error('fixture has no floor');
const FLOOR = GROUND.id;

const roomsOf = (map: HomeMap): readonly HomeMapRoom[] => map.floors[0]?.rooms ?? [];

describe('materials tool', () => {
  it('offers every floor of the plan and each one has its own look in the renderer', () => {
    expect(FLOOR_CHOICES).toHaveLength(18);
    for (const item of FLOOR_CHOICES) {
      const look = floorLookOf(
        { status: 'material', kind: item.kind, variant: item.variant, tint: null },
        [0, 0, 0],
        { tone: 'material', theme: 'light' },
      );
      expect(look.base, item.id).not.toEqual([0, 0, 0]);
    }
  });

  it('takes wall paint and tints from the model library finish tokens', () => {
    for (const swatch of [...WALL_PAINTS, ...FLOOR_TINTS]) {
      expect(swatch.hex).toBe(FINISH_TOKENS[swatch.token].color);
    }
  });

  it('paints a floor through domain ops, resets the tint and keeps unknown fields', () => {
    const herringbone = FLOOR_CHOICES.find((item) => item.id === 'wood:herringbone');
    expect(herringbone).toBeDefined();
    if (herringbone === undefined) return;
    const map = apply(floorMaterialOps(FLOOR, [KITCHEN], herringbone));
    const [kitchen, hall] = roomsOf(map);
    expect(kitchen?.floorMaterial).toEqual({ kind: 'wood', variant: 'herringbone', tint: null });
    expect(hall?.floorMaterial).toEqual(HALL.floorMaterial);
    expect(floorChoiceId(kitchen?.floorMaterial ?? HALL.floorMaterial)).toBe('wood:herringbone');
  });

  it('sets tint and wall paint, and clears them back to the natural look', () => {
    const tinted = apply([
      ...tintOps(FLOOR, [KITCHEN], '#B88A5A'),
      ...wallPaintOps(FLOOR, [KITCHEN], '#3A3D42'),
    ]);
    expect(roomsOf(tinted)[0]?.floorMaterial.tint).toBe('#B88A5A');
    expect(roomsOf(tinted)[0]?.wallPaint).toBe('#3A3D42');
    const cleared = wallPaintOps(FLOOR, [KITCHEN], null);
    expect(cleared[0]).toMatchObject({ op: 'update', patch: { wallPaint: null } });
  });

  it('copies one room look onto every other room of the floor', () => {
    const styled = { ...KITCHEN, wallPaint: '#F2F1EE' };
    const ops = matchRoomOps(FLOOR, styled, [styled, HALL]);
    expect(ops).toHaveLength(1);
    const hall = roomsOf(apply(ops))[1];
    expect(hall?.wallPaint).toBe('#F2F1EE');
    expect(hall?.floorMaterial).toEqual(styled.floorMaterial);
  });

  it('sets ceiling heights per floor and per room, and a room can follow its floor again', () => {
    expect(floorCeilingOps(GROUND, 2.6)).toEqual([]);
    expect(roomCeilingOps(FLOOR, KITCHEN, null)).toEqual([]);
    const map = apply([...floorCeilingOps(GROUND, 2.8), ...roomCeilingOps(FLOOR, KITCHEN, 3.1)]);
    expect(map.floors[0]?.ceilingHeight).toBe(2.8);
    expect(roomsOf(map)[0]?.ceilingHeight).toBe(3.1);
    expect(roomCeilingOps(FLOOR, { ...KITCHEN, ceilingHeight: 3.1 }, null)[0]).toMatchObject({
      patch: { ceilingHeight: null },
    });
  });

  it('draws a preview path for every floor pattern', () => {
    for (const pattern of FLOOR_PATTERNS) {
      const path = patternPath(pattern, 0.2);
      expect(pattern === 'plain' ? path === '' : path.startsWith('M'), pattern).toBe(true);
    }
  });
});

const wall = (id: string, from: number, to: number, x: number): HomeMapWall =>
  HOME_MAP_WALL_WRITE.parse({
    id,
    from: { x, y: from },
    to: { x, y: to },
    thickness: 0.1,
    height: null,
    kind: 'solid',
    origin: { kind: 'hand' },
  });

const WEST = room('00000000-0000-4000-8000-0000000000c1', 'West');
const EAST = room('00000000-0000-4000-8000-0000000000c2', 'East', 3);
const SHARED = wall('00000000-0000-4000-8000-0000000000d1', 0, 3, 3);
const OUTSIDE = wall('00000000-0000-4000-8000-0000000000d2', 0, 3, 0);
const PAIR = { id: FLOOR, rooms: [WEST, EAST], walls: [SHARED, OUTSIDE] };

const LARGE_TILES = FLOOR_CHOICES.find((item) => item.id === 'tile:large');
const GRAPHITE = WALL_CHOICES.find((item) => item.label === 'Graphite');

describe('finishes in the scene', () => {
  it('paints the room on the tapped side of a wall, or the room behind an outside face', () => {
    const left = { kind: 'wall', wallId: SHARED.id, side: 'left' } as const;
    const right = { kind: 'wall', wallId: SHARED.id, side: 'right' } as const;
    const outside = { kind: 'wall', wallId: OUTSIDE.id, side: 'left' } as const;
    expect(paintedRoom(PAIR, left)?.id).toBe(WEST.id);
    expect(paintedRoom(PAIR, right)?.id).toBe(EAST.id);
    expect(paintedRoom(PAIR, outside)?.id).toBe(WEST.id);
    expect(paintedRoom(PAIR, { kind: 'floor', roomId: EAST.id })?.id).toBe(EAST.id);
  });

  it('applies the armed floor or wall finish and skips a finish the room already has', () => {
    if (LARGE_TILES === undefined || GRAPHITE === undefined) throw new Error('missing finish');
    const pick = { ...INITIAL_FINISH, floor: LARGE_TILES, wall: GRAPHITE };
    const floorTap = { kind: 'floor', roomId: EAST.id } as const;
    expect(paintOps(FLOOR, EAST, pick, floorTap)).toEqual(
      floorMaterialOps(FLOOR, [EAST], LARGE_TILES),
    );
    const done = { ...EAST, floorMaterial: { kind: 'tile', variant: 'large', tint: null } };
    expect(paintOps(FLOOR, done, pick, floorTap)).toEqual([]);
    const wallTap = { kind: 'wall', wallId: SHARED.id, side: 'right' } as const;
    expect(paintOps(FLOOR, EAST, pick, wallTap)).toEqual([
      { op: 'update', kind: 'room', floorId: FLOOR, id: EAST.id, patch: { wallPaint: '#3A3D42' } },
    ]);
    expect(paintOps(FLOOR, { ...EAST, wallPaint: '#3A3D42' }, pick, wallTap)).toEqual([]);
  });

  it('puts the scene in paint mode for floors and walls and names the finish', () => {
    const floors = finishOverlay(INITIAL_FINISH, 'r1', false);
    expect(floors).toMatchObject({ mode: 'paint', paint: { surface: 'floor' }, selection: ['r1'] });
    const walls = { ...INITIAL_FINISH, surface: 'walls' } as const;
    expect(finishOverlay(walls, null, false)).toMatchObject({
      mode: 'paint',
      paint: { surface: 'wall' },
      selection: [],
    });
    expect(finishNotice(INITIAL_FINISH).text).toBe('Tap a floor to apply Light wood');
    expect(finishNotice(walls).text).toBe('Tap a wall to apply Matte white');
  });

  it('keeps ceilings in the panel: no paint mode, a tap only picks the room', () => {
    const ceilings = { ...INITIAL_FINISH, surface: 'ceilings' } as const;
    expect(finishOverlay(ceilings, null, false)).toMatchObject({ mode: 'none', paint: null });
    expect(finishNotice(ceilings).text).toBe(CEILING_HINT);
  });

  it('offers plain walls and every wall paint', () => {
    expect(WALL_CHOICES.map((item) => item.hex)).toEqual([
      null,
      ...WALL_PAINTS.map((item) => item.hex),
    ]);
  });
});
