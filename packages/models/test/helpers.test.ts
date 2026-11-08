import {
  MODEL_SPEC_GEOMETRY,
  MODEL_SPEC_PATH,
  type ModelSpecGeometry,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  MODEL_LODS,
  colorMaterial,
  estimateGeometryTriangles,
  estimateSpecTriangles,
  extrudePath,
  finishSet,
  grille,
  lathe,
  lodSegmentCount,
  paramDefaults,
  paramPresets,
  part,
  pathBuilder,
  resolveBindable,
  roundedBox,
  roundedRectPath,
  slats,
  tokenMaterial,
  type ModelLod,
} from '../src/index';
import * as models from '../src/index';
import { lampSpec } from './fixture';

const SQUARE = [
  { op: 'move', x: -0.1, y: -0.1 },
  { op: 'line', x: 0.1, y: -0.1 },
  { op: 'line', x: 0.1, y: 0.1 },
  { op: 'line', x: -0.1, y: 0.1 },
  { op: 'line', x: -0.1, y: -0.1 },
] as const;

const CURVED = [
  { op: 'move', x: -0.1, y: -0.1 },
  { op: 'line', x: 0.1, y: -0.1 },
  { op: 'quadratic', cx: 0.15, cy: 0, x: 0.1, y: 0.1 },
  { op: 'cubic', c1x: 0.05, c1y: 0.15, c2x: -0.05, c2y: 0.15, x: -0.1, y: 0.1 },
  { op: 'arc', rx: 0.1, ry: 0.1, large: false, sweep: true, x: -0.1, y: -0.1 },
] as const;

const PROFILE: [number, number][] = [
  [0, 0],
  [0.1, 0.02],
  [0.08, 0.2],
  [0, 0.22],
];

const MEASURED: readonly (readonly [
  string,
  ModelSpecGeometry,
  readonly [number, number, number],
])[] = [
  [
    'roundedBox',
    { type: 'roundedBox', width: 0.4, height: 0.2, depth: 0.1, radius: 0.02 },
    [108, 300, 972],
  ],
  [
    'cylinder',
    { type: 'cylinder', height: 0.3, topRadius: 0.1, bottomRadius: 0.12 },
    [48, 96, 192],
  ],
  [
    'bevelled cylinder',
    { type: 'cylinder', height: 0.3, topRadius: 0.1, bottomRadius: 0.12, bevel: 0.01 },
    [120, 336, 1056],
  ],
  ['cone', { type: 'cylinder', height: 0.3, topRadius: 0, bottomRadius: 0.12 }, [24, 48, 96]],
  [
    'inverted cone',
    { type: 'cylinder', height: 0.3, topRadius: 0.1, bottomRadius: 0 },
    [24, 48, 96],
  ],
  ['capsule', { type: 'capsule', radius: 0.05, length: 0.2 }, [80, 288, 1088]],
  ['thin capsule', { type: 'capsule', radius: 0.05, length: 0.2, segments: 20 }, [80, 140, 440]],
  ['sphere', { type: 'sphere', radius: 0.1 }, [120, 528, 2208]],
  ['hemisphere', { type: 'sphere', radius: 0.1, thetaLength: 90 }, [132, 552, 2256]],
  [
    'band',
    { type: 'sphere', radius: 0.1, thetaStart: 30, thetaLength: 90, phiLength: 180 },
    [144, 576, 2304],
  ],
  ['torus', { type: 'torus', radius: 0.2, tube: 0.03 }, [144, 576, 2304]],
  ['lathe', { type: 'lathe', profile: PROFILE }, [72, 144, 288]],
  ['flat extrude', { type: 'extrude', path: [...SQUARE], depth: 0.02 }, [12, 12, 12]],
  [
    'bevelled extrude',
    { type: 'extrude', path: [...SQUARE], depth: 0.02, bevel: 0.004 },
    [28, 44, 76],
  ],
  [
    'curved extrude',
    { type: 'extrude', path: [...CURVED], depth: 0.02, bevel: 0.004 },
    [132, 392, 1296],
  ],
  [
    'tube',
    {
      type: 'tube',
      points: [
        [0, 0, 0],
        [0.1, 0.1, 0],
        [0.2, 0, 0],
      ],
      radius: 0.01,
    },
    [64, 256, 1024],
  ],
  [
    'long tube',
    {
      type: 'tube',
      points: [
        [0, 0, 0],
        [0.1, 0.1, 0],
        [0.2, 0, 0],
        [0.3, 0.1, 0],
      ],
      radius: 0.01,
      segments: 8,
    },
    [96, 192, 768],
  ],
  [
    'rounded plane',
    { type: 'roundedPlane', width: 0.2, height: 0.1, radius: 0.02, segments: 4 },
    [10, 18, 34],
  ],
  [
    'square plane',
    { type: 'roundedPlane', width: 0.2, height: 0.1, radius: 0, segments: 4 },
    [2, 2, 2],
  ],
  ['glow', { type: 'glow', width: 0.6, height: 0.4 }, [60, 264, 1104]],
  ['ring', { type: 'ring', innerRadius: 0.05, outerRadius: 0.1 }, [24, 48, 96]],
  [
    'single hole grille',
    { type: 'grille', width: 0.2, height: 0.1, rows: 1, columns: 1, holeRadius: 0.005 },
    [2, 11, 17],
  ],
  [
    'slats',
    { type: 'slats', count: 5, spacing: 0.02, width: 0.2, height: 0.01, depth: 0.03 },
    [60, 540, 1500],
  ],
];

describe('estimateGeometryTriangles', () => {
  it.each(MEASURED)('matches the tessellation of the builder for %s', (_name, geometry, counts) => {
    expect(MODEL_SPEC_GEOMETRY.safeParse(geometry).success).toBe(true);
    expect(MODEL_LODS.map((lod) => estimateGeometryTriangles(geometry, lod))).toStrictEqual(counts);
  });

  it('estimates a grille with many holes within 8 percent of the builder', () => {
    const many = grille({ width: 0.2, height: 0.1, rows: 3, columns: 4, holeRadius: 0.005 });

    expect(estimateGeometryTriangles(many, 0)).toBe(2);
    expect(estimateGeometryTriangles(many, 1)).toBeGreaterThanOrEqual(102);
    expect(estimateGeometryTriangles(many, 1)).toBeLessThanOrEqual(110);
    expect(estimateGeometryTriangles(many, 2)).toBeGreaterThanOrEqual(174);
    expect(estimateGeometryTriangles(many, 2)).toBeLessThanOrEqual(182);
  });

  it('adds the outlines of a path with several contours', () => {
    const twin = extrudePath(
      [
        ...SQUARE,
        { op: 'move', x: 0, y: 0 },
        { op: 'line', x: 0.01, y: 0 },
        { op: 'line', x: 0, y: 0.01 },
      ],
      0.02,
    );

    expect(estimateGeometryTriangles(twin, 0)).toBe(12 + 2 * 3 + 2);
  });

  it('follows bound values through the params', () => {
    const bevelled: ModelSpecGeometry = {
      type: 'cylinder',
      height: 0.3,
      topRadius: { param: 'r' },
      bottomRadius: 0.1,
      bevel: { param: 'edge', scale: 2 },
    };

    expect(estimateGeometryTriangles(bevelled, 0, { r: 0.1, edge: 0 })).toBe(48);
    expect(estimateGeometryTriangles(bevelled, 0, { r: 0.1, edge: 0.01 })).toBe(120);
    expect(() => estimateGeometryTriangles(bevelled, 0, { edge: 0 })).toThrow('param r');
  });

  it('keeps a rounded plane square when a bound size is zero', () => {
    const plane: ModelSpecGeometry = {
      type: 'roundedPlane',
      width: { param: 'w' },
      height: 0.1,
      radius: 0.02,
    };

    expect(estimateGeometryTriangles(plane, 0, { w: 0 })).toBe(2);
    expect(estimateGeometryTriangles(plane, 0, { w: 0.2 })).toBe(10);
  });
});

describe('estimateSpecTriangles', () => {
  it('sums the parts that exist at the level of detail with the default params', () => {
    const lamp = lampSpec();

    expect(MODEL_LODS.map((lod) => estimateSpecTriangles(lamp, lod))).toStrictEqual([
      180, 444, 2232,
    ]);
  });

  it('reads params from the spec as defaults and as min, default and max presets', () => {
    const lamp = lampSpec();

    expect(paramDefaults(lamp)).toStrictEqual({ reach: 0.5 });
    expect(paramPresets(lamp)).toStrictEqual([
      ['min', { reach: 0 }],
      ['default', { reach: 0.5 }],
      ['max', { reach: 1 }],
    ]);
    expect(paramDefaults({})).toStrictEqual({});
    expect(paramPresets({}).map(([name, values]) => [name, values])).toStrictEqual([
      ['min', {}],
      ['default', {}],
      ['max', {}],
    ]);
  });

  it('resolves a binding to scale times the param plus the offset', () => {
    expect(resolveBindable(3, {})).toBe(3);
    expect(resolveBindable({ param: 'a' }, { a: 4 })).toBe(4);
    expect(resolveBindable({ param: 'a', scale: 2, offset: 1 }, { a: 4 })).toBe(9);
  });

  it('scales segments by level of detail with a floor', () => {
    const levels: ModelLod[] = [0, 1, 2];

    expect(levels.map((lod) => lodSegmentCount(48, lod, 8))).toStrictEqual([12, 24, 48]);
    expect(lodSegmentCount(4, 0, 3)).toBe(3);
  });
});

describe('path builder', () => {
  it('builds every command and closes back to the start', () => {
    const path = pathBuilder(0, 0)
      .line(1, 0)
      .quadratic(1.5, 0.5, 1, 1)
      .cubic([0.8, 1.2], [0.2, 1.2], 0, 1)
      .arc({ rx: 1, ry: 2, rotation: 15, large: true, sweep: false }, 0, 0.5)
      .arc({ rx: 1, ry: 1 }, 0, 0.25)
      .close()
      .build();

    expect(MODEL_SPEC_PATH.safeParse(path).success).toBe(true);
    expect(path.map((command) => command.op)).toStrictEqual([
      'move',
      'line',
      'quadratic',
      'cubic',
      'arc',
      'arc',
      'line',
    ]);
    expect(path[4]).toStrictEqual({
      op: 'arc',
      rx: 1,
      ry: 2,
      rotation: 15,
      large: true,
      sweep: false,
      x: 0,
      y: 0.5,
    });
    expect(path[5]).toStrictEqual({
      op: 'arc',
      rx: 1,
      ry: 1,
      large: false,
      sweep: true,
      x: 0,
      y: 0.25,
    });
    expect(path[6]).toStrictEqual({ op: 'line', x: 0, y: 0 });
  });

  it('does not change a path that was extended', () => {
    const base = pathBuilder(0, 0).line(1, 0);
    base.line(2, 0);

    expect(base.build()).toHaveLength(2);
  });

  it('draws a rounded rectangle with four quarter arcs that ends where it starts', () => {
    const path = roundedRectPath(0.4, 0.2, 0.05);

    expect(MODEL_SPEC_PATH.safeParse(path).success).toBe(true);
    expect(path.filter((command) => command.op === 'arc')).toHaveLength(4);
    expect(path[0]).toMatchObject({ op: 'move', y: -0.1 });
    expect(path[0]?.x).toBeCloseTo(-0.15);
    expect(path[path.length - 1]).toMatchObject({ op: 'arc', x: path[0]?.x, y: path[0]?.y });
  });

  it('caps the radius at half the shorter side and draws a plain rectangle at zero', () => {
    expect(roundedRectPath(0.4, 0.2, 5).find((c) => c.op === 'arc')).toMatchObject({
      rx: 0.1,
    });
    expect(roundedRectPath(0.4, 0.2, 0).map((command) => command.op)).toStrictEqual([
      'move',
      'line',
      'line',
      'line',
      'line',
    ]);
  });

  it('wraps a path in an extrude with an optional bevel', () => {
    const builder = pathBuilder(0, 0).line(1, 0).line(0, 1).close();

    expect(extrudePath(builder, 0.02)).toStrictEqual({
      type: 'extrude',
      path: builder.build(),
      depth: 0.02,
    });
    expect(extrudePath(builder.build(), 0.02, 0.003)).toMatchObject({ bevel: 0.003 });
    expect(
      MODEL_SPEC_GEOMETRY.safeParse(extrudePath(roundedRectPath(0.4, 0.2, 0.05), 0.02, 0.003))
        .success,
    ).toBe(true);
  });
});

describe('geometry and finish helpers', () => {
  it('build geometries and parts the spec schema accepts', () => {
    const box = roundedBox({ width: 0.1, height: 0.1, depth: 0.1, radius: 0.01, segments: 6 });
    const geometries = [
      box,
      lathe({ profile: PROFILE, segments: 24 }),
      slats({ count: 4, spacing: 0.01, width: 0.1, height: 0.004, depth: 0.05 }),
      grille({ width: 0.1, height: 0.1, rows: 4, columns: 4, holeRadius: 0.004 }),
    ];

    expect(
      geometries.map((geometry) => MODEL_SPEC_GEOMETRY.safeParse(geometry).success),
    ).toStrictEqual([true, true, true, true]);
    expect(geometries.map((geometry) => geometry.type)).toStrictEqual([
      'roundedBox',
      'lathe',
      'slats',
      'grille',
    ]);
    expect(part('p', box, 'body')).toMatchObject({
      id: 'p',
      material: 'body',
    });
    expect(
      part('p', lathe({ profile: PROFILE }), 'body', { minLod: 1, contact: true }),
    ).toMatchObject({ minLod: 1, contact: true });
  });

  it('make materials from a colour or a finish token and sets of finishes', () => {
    expect(colorMaterial('#112233', { roughness: 0.3 })).toStrictEqual({
      color: '#112233',
      roughness: 0.3,
    });
    expect(tokenMaterial('oak')).toStrictEqual({ finish: 'oak' });
    expect(
      finishSet(
        { white: { body: colorMaterial('#ffffff') }, oak: { body: tokenMaterial('oak') } },
        'oak',
      ),
    ).toStrictEqual({
      finishes: { white: { body: { color: '#ffffff' } }, oak: { body: { finish: 'oak' } } },
      defaultFinish: 'oak',
    });
  });

  it('are exported from the package entry', () => {
    expect(Object.keys(models).sort()).toStrictEqual(
      [
        'ACCENT_SLOT',
        'AUTHORING_MATERIAL_SLOTS',
        'AUTHORING_TRIANGLE_TARGETS',
        'box',
        'MODEL_LODS',
        'MODEL_REGISTRY',
        'checkAuthoring',
        'checkRegistry',
        'colorMaterial',
        'estimateGeometryTriangles',
        'estimateSpecTriangles',
        'extrudePath',
        'finishSet',
        'grille',
        'lathe',
        'lodSegmentCount',
        'paramDefaults',
        'paramPresets',
        'part',
        'pathBuilder',
        'placed',
        'resolveBindable',
        'roundedBox',
        'roundedRectPath',
        'slats',
        'tokenMaterial',
      ].sort(),
    );
  });
});
