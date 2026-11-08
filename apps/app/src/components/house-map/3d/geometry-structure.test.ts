import { readFileSync } from 'node:fs';
import { VACUUM_SCENE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type {
  RenderFloor,
  RenderOpening,
  RenderPoint,
  RenderRoom,
  RenderWall,
} from '../render-scene';
import { vacuumRenderScene } from '../adapters/vacuum-scene';
import { cutPositions } from './cutaway';
import { hexRgb, type StructureTheme } from './floor-looks';
import {
  DEFAULT_STRUCTURE_OPTIONS,
  buildStructure,
  type StructureGeometry,
  type StructureOptions,
} from './geometry-structure';
import type { MeshLayer, Rgb } from './mesh';
import { VACUUM_QUALITY_TARGET } from './quality-target';

const UP_NORMAL = 1;

const [scrubbedFloor] = vacuumRenderScene({
  scene: VACUUM_SCENE.parse(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../features/devices/vacuum/model/scene-geometry.fixture.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  ),
}).floors;

const VACUUM_LOOK: StructureOptions = {
  ...DEFAULT_STRUCTURE_OPTIONS,
  wallStyle: 'low',
  floorTone: 'room',
};

function rect(minX: number, minY: number, maxX: number, maxY: number): readonly RenderPoint[] {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function room(
  id: string,
  outer: readonly RenderPoint[],
  extra: Partial<RenderRoom> = {},
): RenderRoom {
  return {
    id,
    name: id,
    homeRoomId: null,
    polygons: [{ outer, holes: [] }],
    labelAt: outer[0] ?? { x: 0, y: 0 },
    colourSlot: 1,
    floor: { status: 'none' },
    wallPaint: null,
    ceilingHeight: 2.6,
    areaM2: 16,
    hidden: false,
    ...extra,
  };
}

function wall(
  id: string,
  from: RenderPoint,
  to: RenderPoint,
  extra: Partial<RenderWall> = {},
): RenderWall {
  return { id, from, to, thickness: 0.1, height: 2.6, kind: 'solid', exterior: false, ...extra };
}

function opening(
  from: RenderPoint,
  to: RenderPoint,
  extra: Partial<RenderOpening> = {},
): RenderOpening {
  return {
    id: `opening:${String(from.x)}`,
    wallId: null,
    from,
    to,
    kind: 'door',
    sourceKind: null,
    sillHeight: 0,
    headHeight: 2,
    hinge: 'left',
    swing: 'in',
    contactDeviceId: null,
    lockDeviceId: null,
    roomIds: [],
    ...extra,
  };
}

function floorOf(extra: Partial<RenderFloor>): RenderFloor {
  return {
    id: 'ground',
    name: 'Ground',
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    bounds: null,
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    placements: [],
    carpets: [],
    markers: [],
    measures: [],
    vacuum: null,
    ...extra,
  };
}

const key = (colour: Rgb | readonly number[] | Float32Array): string =>
  Array.from(colour, (channel) => channel.toFixed(3)).join(',');

function colourKeys(layer: MeshLayer | null, pick: (vertex: number) => boolean): Set<string> {
  const keys = new Set<string>();
  for (let vertex = 0; vertex < (layer?.colours.length ?? 0) / 3; vertex += 1) {
    if (layer !== null && pick(vertex))
      keys.add(key(layer.colours.slice(vertex * 3, vertex * 3 + 3)));
  }
  return keys;
}

function heights(layer: MeshLayer | null): readonly number[] {
  return Array.from({ length: (layer?.positions.length ?? 0) / 3 }, (_, vertex) =>
    Number(layer?.positions[vertex * 3 + 1]),
  );
}

function wallColours(theme: StructureTheme): {
  readonly tops: Set<string>;
  readonly sides: Set<string>;
} {
  if (scrubbedFloor === undefined) throw new Error('no floor');
  const { walls } = buildStructure(scrubbedFloor, { ...VACUUM_LOOK, theme });
  const up = (vertex: number): boolean => walls?.normals[vertex * 3 + 1] === UP_NORMAL;
  return { tops: colourKeys(walls, up), sides: colourKeys(walls, (vertex) => !up(vertex)) };
}

describe('wall colours', () => {
  it('draws light-theme walls pale warm grey with lighter tops', () => {
    const { tops, sides } = wallColours('light');
    expect([...sides].sort()).toStrictEqual([key(hexRgb(0xd3cec4)), key(hexRgb(0xe4e0d8))].sort());
    expect([...tops].sort()).toStrictEqual([key(hexRgb(0xf4f1eb)), key(hexRgb(0xf8f6f2))].sort());
  });

  it('keeps the dark-theme walls as they were', () => {
    const { tops, sides } = wallColours('dark');
    expect([...sides].sort()).toStrictEqual([key(hexRgb(0x5a5853)), key(hexRgb(0x6e6c66))].sort());
    expect(tops).toStrictEqual(sides);
  });

  it('paints each side of a wall with the paint of the room on that side', () => {
    const shared = wall('middle', { x: 4, y: 0 }, { x: 4, y: 4 });
    const structure = buildStructure(
      floorOf({
        rooms: [
          room('west', rect(0, 0, 4, 4)),
          room('east', rect(4, 0, 8, 4), { wallPaint: '#336699' }),
        ],
        walls: [shared],
      }),
    );
    const facing =
      (sign: number) =>
      (vertex: number): boolean =>
        Math.sign(Number(structure.walls?.normals[vertex * 3])) === sign;
    expect([...colourKeys(structure.walls, facing(1))]).toEqual([key(hexRgb(0x336699))]);
    expect([...colourKeys(structure.walls, facing(-1))]).toEqual([key(hexRgb(0xe4e0d8))]);
  });
});

describe('openings', () => {
  const across = wall('south', { x: 0, y: 0 }, { x: 4, y: 0 });

  it('leaves a door gap with a lintel above the head height', () => {
    const structure = buildStructure(
      floorOf({ walls: [across], openings: [opening({ x: 1, y: 0 }, { x: 2, y: 0 })] }),
    );
    expect(structure.spans.map((span) => span.base)).toEqual([0, 2, 0]);
    expect(structure.walls?.triangles).toBe(3 * 10);
  });

  it('glazes a window between its sill and head in its own colour', () => {
    const window = opening(
      { x: 1, y: 0 },
      { x: 3, y: 0 },
      { kind: 'window', sillHeight: 0.9, headHeight: 2.1 },
    );
    const structure = buildStructure(floorOf({ walls: [across], openings: [window] }));
    expect(structure.spans.map((span) => span.base)).toEqual([0, 0, 0.9, 2.1, 0]);
    expect(colourKeys(structure.walls, () => true)).toContain(key(hexRgb(0xa9d4ea)));
  });

  it('collapses a lintel above the cut height so no strip floats over the doorway', () => {
    const structure = buildStructure(
      floorOf({ walls: [across], openings: [opening({ x: 1, y: 0 }, { x: 2, y: 0 })] }),
    );
    const lintel = structure.spans[1];
    if (structure.walls === null || lintel === undefined) throw new Error('no lintel');
    const cut = cutPositions(structure.walls.positions, structure.spans, {
      walls: [true, true, true],
      height: structure.cutHeight,
    });
    const corners = new Set(
      Array.from({ length: lintel.vertexCount }, (_, index) =>
        key(cut.slice((lintel.firstVertex + index) * 3, (lintel.firstVertex + index) * 3 + 3)),
      ),
    );
    expect(corners.size).toBe(1);
  });

  it('ignores an opening that is not on the wall', () => {
    const elsewhere = opening({ x: 1, y: 2 }, { x: 2, y: 2 });
    expect(buildStructure(floorOf({ walls: [across], openings: [elsewhere] })).spans).toHaveLength(
      1,
    );
  });
});

describe('wall styles', () => {
  const walls = [wall('a', { x: 0, y: 0 }, { x: 4, y: 0 })];
  const tallest = (structure: StructureGeometry): number => Math.max(...heights(structure.walls));

  it('keeps the real height and cuts facing walls by default', () => {
    const structure = buildStructure(floorOf({ walls }));
    expect(tallest(structure)).toBeCloseTo(2.6, 5);
    expect(structure.spans).toHaveLength(1);
  });

  it('lowers every wall in the low style and keeps lower walls as they are', () => {
    const low = buildStructure(floorOf({ walls }), {
      ...DEFAULT_STRUCTURE_OPTIONS,
      wallStyle: 'low',
    });
    expect(tallest(low)).toBeCloseTo(1.2, 5);
    const short = [wall('b', { x: 0, y: 0 }, { x: 4, y: 0 }, { height: 0.8 })];
    expect(tallest(buildStructure(floorOf({ walls: short }), VACUUM_LOOK))).toBeCloseTo(0.8, 5);
  });

  it('shows full walls without any cut', () => {
    const full = buildStructure(floorOf({ walls }), {
      ...DEFAULT_STRUCTURE_OPTIONS,
      wallStyle: 'full',
    });
    expect(tallest(full)).toBeCloseTo(2.6, 5);
    expect(full.spans).toEqual([]);
  });
});

describe('floors', () => {
  const wood = room('hall', rect(0, 0, 4, 4), {
    floor: { status: 'material', kind: 'wood', variant: 'dark', tint: null },
  });

  it('colours a floor by its material with a plank pattern', () => {
    const [range] = buildStructure(floorOf({ rooms: [wood] })).rooms;
    expect(range?.look.pattern).toBe('planks');
    expect(key(range?.look.base ?? [])).toBe(key(hexRgb(0x6f4a2e)));
  });

  it('lets a tint override the material colour and keeps the room colour in the room tone', () => {
    const tinted = { ...wood, floor: { ...wood.floor, tint: '#808080' } } as const;
    const [range] = buildStructure(floorOf({ rooms: [tinted] })).rooms;
    expect(key(range?.look.base ?? [])).toBe(key(hexRgb(0x808080)));
    const [roomTone] = buildStructure(floorOf({ rooms: [wood] }), VACUUM_LOOK).rooms;
    expect(key(roomTone?.look.base ?? [])).toBe(key(hexRgb(0xbcd4ec)));
    expect(roomTone?.look.pattern).toBe('planks');
  });

  it('draws an unknown material plain in the room colour', () => {
    const odd = room('odd', rect(0, 0, 4, 4), {
      floor: { status: 'material', kind: 'moon-rock', variant: null, tint: null },
    });
    const [range] = buildStructure(floorOf({ rooms: [odd] })).rooms;
    expect(range?.look.pattern).toBe('plain');
    expect(key(range?.look.base ?? [])).toBe(key(hexRgb(0xbcd4ec)));
  });

  it('leaves a hole in the floor uncovered', () => {
    const ring = room('ring', rect(0, 0, 6, 6), {
      polygons: [{ outer: rect(0, 0, 6, 6), holes: [[...rect(2, 2, 4, 4)].reverse()] }],
    });
    const { floor } = buildStructure(floorOf({ rooms: [ring] }));
    if (floor === null) throw new Error('no floor');
    const centres = Array.from({ length: floor.triangles }, (_, triangle) => {
      const corner = (offset: number): number => Number(floor.indices[triangle * 3 + offset]);
      const x =
        [0, 1, 2].reduce((sum, offset) => sum + Number(floor.positions[corner(offset) * 3]), 0) / 3;
      const y =
        [0, 1, 2].reduce(
          (sum, offset) => sum - Number(floor.positions[corner(offset) * 3 + 2]),
          0,
        ) / 3;
      return { x, y };
    });
    expect(centres.some((at) => at.x > 2 && at.x < 4 && at.y > 2 && at.y < 4)).toBe(false);
    expect(floor.triangles).toBe(8);
  });
});

describe('a large synthetic house', () => {
  const ROOMS = 20;
  const rooms = Array.from({ length: ROOMS }, (_, index) =>
    room(
      `room-${String(index)}`,
      rect(
        (index % 5) * 4,
        Math.floor(index / 5) * 4,
        (index % 5) * 4 + 4,
        Math.floor(index / 5) * 4 + 4,
      ),
    ),
  );
  const walls = rooms.flatMap((entry) => {
    const [a, b, c, d] = entry.polygons[0]?.outer ?? [];
    if (a === undefined || b === undefined || c === undefined || d === undefined) return [];
    return [
      wall(`${entry.id}:s`, a, b),
      wall(`${entry.id}:e`, b, c),
      wall(`${entry.id}:n`, c, d),
      wall(`${entry.id}:w`, d, a),
    ];
  });
  const openings = walls.map((entry, index) => {
    const at = (share: number): RenderPoint => ({
      x: entry.from.x + (entry.to.x - entry.from.x) * share,
      y: entry.from.y + (entry.to.y - entry.from.y) * share,
    });
    return opening(at(0.3), at(0.55), {
      id: `opening:${String(index)}`,
      wallId: entry.id,
      ...(index % 2 === 0 ? { kind: 'window', sillHeight: 0.9, headHeight: 2.1 } : {}),
    });
  });
  const structure = buildStructure(floorOf({ rooms, walls, openings }));

  it('keeps every room, wall and opening and stays inside the vacuum quality target', () => {
    expect(structure.rooms).toHaveLength(ROOMS);
    expect(structure.spans).toHaveLength(
      walls.length * 2 + (walls.length / 2) * 3 + (walls.length / 2) * 1,
    );
    const layers = [structure.floor, structure.walls, structure.carpets].filter(
      (layer) => layer !== null,
    );
    const triangles = layers.reduce((sum, layer) => sum + layer.triangles, 0);
    expect(layers.length).toBeLessThanOrEqual(VACUUM_QUALITY_TARGET.drawCalls);
    expect(triangles).toBeLessThan(VACUUM_QUALITY_TARGET.triangles);
  });

  it('is deterministic', () => {
    expect(buildStructure(floorOf({ rooms, walls, openings }))).toEqual(structure);
  });
});
