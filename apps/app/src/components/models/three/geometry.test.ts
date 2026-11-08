import { MODEL_SPEC_GEOMETRY, type ModelSpecGeometry } from '@smarteverything/domain';
import type { BufferGeometry } from 'three';

type ModelSpecPathCommand = Extract<ModelSpecGeometry, { type: 'extrude' }>['path'][number];
import { describe, expect, it } from 'vitest';
import {
  MODEL_LOD_LEVELS,
  buildGeometry,
  grilleHoleRadius,
  lodSegments,
  pathShapes,
  resolveValue,
  triangleCount,
} from './geometry';

const SAMPLES: readonly ModelSpecGeometry[] = [
  { type: 'roundedBox', width: 0.4, height: 0.2, depth: 0.1, radius: 0.02 },
  { type: 'cylinder', height: 0.3, topRadius: 0.1, bottomRadius: 0.12, bevel: 0.01 },
  { type: 'capsule', radius: 0.05, length: 0.2 },
  { type: 'sphere', radius: 0.1, thetaLength: 90 },
  { type: 'torus', radius: 0.2, tube: 0.03 },
  {
    type: 'lathe',
    profile: [
      [0, 0],
      [0.1, 0.02],
      [0.08, 0.2],
      [0, 0.22],
    ],
  },
  {
    type: 'extrude',
    path: [
      { op: 'move', x: -0.1, y: -0.1 },
      { op: 'line', x: 0.1, y: -0.1 },
      { op: 'quadratic', cx: 0.15, cy: 0, x: 0.1, y: 0.1 },
      { op: 'cubic', c1x: 0.05, c1y: 0.15, c2x: -0.05, c2y: 0.15, x: -0.1, y: 0.1 },
      { op: 'arc', rx: 0.1, ry: 0.1, large: false, sweep: true, x: -0.1, y: -0.1 },
    ],
    depth: 0.02,
    bevel: 0.004,
  },
  {
    type: 'tube',
    points: [
      [0, 0, 0],
      [0.1, 0.1, 0],
      [0.2, 0.1, 0.1],
    ],
    radius: 0.01,
  },
  { type: 'roundedPlane', width: 0.3, height: 0.2, radius: 0.03 },
  { type: 'glow', width: 0.3, height: 0.2 },
  { type: 'ring', innerRadius: 0.05, outerRadius: 0.08 },
  { type: 'grille', width: 0.2, height: 0.2, rows: 4, columns: 5, holeRadius: 0.01 },
  { type: 'slats', count: 6, spacing: 0.03, width: 0.5, height: 0.01, depth: 0.05 },
];

function size(geometry: BufferGeometry): readonly [number, number, number] {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) throw new Error('no bounding box');
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
}

function at(spec: ModelSpecGeometry): readonly number[] {
  return MODEL_LOD_LEVELS.map((lod) => triangleCount(buildGeometry(spec, lod)));
}

describe('buildGeometry covers every primitive of the spec per LOD', () => {
  it('has one sample per geometry type and every sample is a valid spec geometry', () => {
    const types = new Set(SAMPLES.map((sample) => sample.type));
    expect([...types].sort()).toEqual([...MODEL_SPEC_GEOMETRY.options.map(typeOf)].sort());
    for (const sample of SAMPLES) expect(MODEL_SPEC_GEOMETRY.safeParse(sample).success).toBe(true);
  });

  it.each(SAMPLES.map((sample) => [sample.type, sample] as const))(
    '%s builds finite triangles with normals at every LOD, more detail at higher LOD',
    (_, sample) => {
      for (const lod of MODEL_LOD_LEVELS) {
        const geometry = buildGeometry(sample, lod);
        const position = geometry.getAttribute('position');
        expect(triangleCount(geometry)).toBeGreaterThan(0);
        expect(geometry.getAttribute('normal').count).toBe(position.count);
        expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      }
      const [tile, card, hero] = at(sample);
      expect(card).toBeGreaterThanOrEqual(tile ?? 0);
      expect(hero).toBeGreaterThan(card ?? 0);
    },
  );
});

describe('triangle counts per LOD', () => {
  it('cylinder uses 12, 24 and 48 radial segments by default', () => {
    expect(at({ type: 'cylinder', height: 1, topRadius: 0.5, bottomRadius: 0.5 })).toEqual([
      48, 96, 192,
    ]);
  });

  it('sphere halves its height segments and drops pole triangles', () => {
    expect(at({ type: 'sphere', radius: 1 })).toEqual([12 * 5 * 2, 24 * 11 * 2, 48 * 23 * 2]);
  });

  it('ring scales its theta segments', () => {
    expect(at({ type: 'ring', innerRadius: 0.5, outerRadius: 1 })).toEqual([24, 48, 96]);
  });

  it('grille is a plain panel at tile LOD and gains its holes from card LOD', () => {
    const grille = SAMPLES.find((sample) => sample.type === 'grille');
    if (!grille) throw new Error('no grille sample');
    const [tile, card] = at(grille);
    expect(tile).toBe(2);
    expect(card).toBeGreaterThan(4 * 5 * 6);
  });

  it('slats are plain boxes at tile LOD, rounded above', () => {
    const slats = { type: 'slats', count: 6, spacing: 0.1, width: 1, height: 0.02, depth: 0.1 };
    const [tile, card, hero] = at(MODEL_SPEC_GEOMETRY.parse(slats));
    expect(tile).toBe(6 * 12);
    expect(card).toBeGreaterThan(tile ?? 0);
    expect(hero).toBeGreaterThan(card ?? 0);
  });

  it('explicit segments set the hero count and never drop below the floor', () => {
    expect(
      at({ type: 'cylinder', height: 1, topRadius: 1, bottomRadius: 1, segments: 16 }),
    ).toEqual([32, 32, 64]);
    expect(lodSegments(3, 0, 8)).toBe(8);
    expect(lodSegments(96, 2, 8)).toBe(96);
  });
});

describe('shapes and sizes', () => {
  it('roundedBox keeps its true size in metres', () => {
    const geometry = buildGeometry(
      { type: 'roundedBox', width: 0.4, height: 0.2, depth: 0.1, radius: 0.02 },
      1,
    );
    const [width, height, depth] = size(geometry);
    expect(width).toBeCloseTo(0.4);
    expect(height).toBeCloseTo(0.2);
    expect(depth).toBeCloseTo(0.1);
  });

  it('bevelled cylinder keeps its radius and height', () => {
    const geometry = buildGeometry(
      { type: 'cylinder', height: 0.3, topRadius: 0.1, bottomRadius: 0.1, bevel: 0.02 },
      2,
    );
    const [width, height] = size(geometry);
    expect(width).toBeCloseTo(0.2);
    expect(height).toBeCloseTo(0.3);
  });

  it('a partial sphere honours its angles in degrees', () => {
    const geometry = buildGeometry({ type: 'sphere', radius: 1, thetaLength: 90 }, 2);
    expect(size(geometry)[1]).toBeCloseTo(1);
  });

  it('extrude is centred on its depth', () => {
    const sample = SAMPLES.find((entry) => entry.type === 'extrude');
    if (!sample) throw new Error('no extrude sample');
    const geometry = buildGeometry(sample, 2);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-0.014);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(0.014);
  });

  it('slats stack along Y with their spacing', () => {
    const geometry = buildGeometry(
      { type: 'slats', count: 5, spacing: 0.1, width: 1, height: 0.02, depth: 0.1 },
      0,
    );
    expect(size(geometry)[1]).toBeCloseTo(0.42);
  });

  it('grille holes never overlap their cell', () => {
    expect(grilleHoleRadius(0.1, 0.04, 0.5)).toBeCloseTo(0.018);
    expect(grilleHoleRadius(0.1, 0.1, 0.01)).toBe(0.01);
  });
});

describe('extrude paths', () => {
  const square = (half: number, clockwise: boolean): ModelSpecPathCommand[] => {
    const corners: readonly [number, number][] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];
    const ordered = clockwise ? [...corners].reverse() : corners;
    return ordered.map(([x, y], index) => ({ op: index === 0 ? 'move' : 'line', x, y }) as const);
  };

  it('a nested subpath becomes a hole', () => {
    const shapes = pathShapes([...square(1, false), ...square(0.5, true)]);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.holes).toHaveLength(1);
  });

  it('arc sweep picks the side of the chord', () => {
    const half = (sweep: boolean): readonly number[] => {
      const [shape] = pathShapes([
        { op: 'move', x: -1, y: 0 },
        { op: 'arc', rx: 0.5, ry: 0.5, large: false, sweep, x: 1, y: 0 },
      ]);
      const ys = (shape?.getPoints(16) ?? []).map((point) => point.y);
      return [Math.min(...ys), Math.max(...ys)];
    };
    expect(half(true)[0]).toBeCloseTo(-1);
    expect(half(false)[1]).toBeCloseTo(1);
  });
});

describe('param bindings', () => {
  it('resolve as a linear term of the param', () => {
    expect(resolveValue(0.3, {})).toBe(0.3);
    expect(resolveValue({ param: 'width' }, { width: 2 })).toBe(2);
    expect(resolveValue({ param: 'width', scale: 0.5, offset: 0.1 }, { width: 2 })).toBeCloseTo(
      1.1,
    );
  });

  it('size the geometry from the params', () => {
    const geometry = buildGeometry(
      { type: 'roundedBox', width: { param: 'width' }, height: 0.5, depth: 0.5, radius: 0.05 },
      0,
      { width: 1.8 },
    );
    expect(size(geometry)[0]).toBeCloseTo(1.8);
  });

  it('fail loudly when a bound param has no value', () => {
    expect(() =>
      buildGeometry({ type: 'ring', innerRadius: 0.1, outerRadius: { param: 'size' } }, 1),
    ).toThrow('model param size has no value');
  });
});

function typeOf(option: (typeof MODEL_SPEC_GEOMETRY.options)[number]): string {
  return option.shape.type.value;
}
