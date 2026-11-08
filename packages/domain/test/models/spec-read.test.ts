import { describe, expect, it } from 'vitest';
import { MODEL_SPEC, MODEL_SPEC_READ, type ModelSpec } from '../../src/models/spec';

const EXTRA = { futureField: 'ignored' };
const VIEW = { yaw: 30, pitch: 20, fov: 35, padding: 0.1 };

function spec(
  extra: (key: string) => Record<string, unknown>,
  stillAt = 0.25,
): Record<string, unknown> {
  return {
    schema: 1,
    id: 'dev.fan.tower',
    version: '1.0.0',
    title: 'Tower fan',
    category: 'climate',
    ...extra('root'),
    footprint: { width: 0.25, depth: 0.25, height: 1, ...extra('footprint') },
    framing: { tile: VIEW, card: { ...VIEW, ...extra('view') }, hero: VIEW, ...extra('framing') },
    meta: { names: { display: 'Fan', ...extra('names') }, ...extra('meta') },
    fov: { hDeg: 90, vDeg: 60, rangeM: 5, exact: false, ...extra('fov') },
    params: { height: { min: 0.6, max: 1.4, default: 1, unit: 'm', ...extra('param') } },
    materials: { body: { color: '#ffffff', ...extra('material') } },
    finishes: { black: { body: { color: '#111111', ...extra('override') } } },
    parts: [
      {
        id: 'shell',
        geometry: { type: 'sphere', radius: 0.1, ...extra('geometry') },
        material: 'body',
        transform: { position: [0, 0, 0], ...extra('transform') },
        poses: { open: { rotation: [0, 0, 45], ...extra('pose') } },
        ...extra('part'),
      },
      {
        id: 'blades',
        parent: 'shell',
        geometry: {
          type: 'extrude',
          depth: 0.1,
          path: [
            { op: 'move', x: 0, y: 0, ...extra('path') },
            { op: 'line', x: 1, y: 0 },
          ],
        },
        material: 'body',
      },
    ],
    anchors: [{ kind: 'mount', id: 'floor', mount: 'floor', ...extra('anchor') }],
    channels: [
      {
        id: 'spin',
        target: 'blades',
        property: 'rotate',
        source: { capability: 'speed', ...extra('signal') },
        map: { type: 'speed', in: [0, 100], perSecond: [0, 3], ...extra('map') },
        motion: { type: 'spin', ...extra('motion') },
        reduced: 'hold',
        ...extra('channel'),
      },
    ],
    shots: [
      {
        id: 'spinning',
        when: {
          anyOf: [
            {
              allOf: [{ signal: 'power', op: 'eq', value: true, ...extra('leaf') }],
              ...extra('all'),
            },
          ],
          ...extra('condition'),
        },
        focus: 'blades',
        zoom: 2,
        yaw: 10,
        pitch: 5,
        easeMs: 400,
        loopS: 1,
        symmetry: 72,
        stillAt,
        ...extra('shot'),
      },
    ],
  };
}

const KEYS = [
  'root',
  'footprint',
  'view',
  'framing',
  'names',
  'meta',
  'fov',
  'param',
  'material',
  'override',
  'geometry',
  'transform',
  'pose',
  'part',
  'path',
  'anchor',
  'signal',
  'map',
  'motion',
  'channel',
  'leaf',
  'all',
  'condition',
  'shot',
];

const CLEAN = spec(() => ({}));
const everywhere = spec(() => EXTRA);

function unknownFieldPaths(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => unknownFieldPaths(item, `${path}[${String(index)}]`));
  }
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === 'futureField' ? [`${path}.${key}`] : unknownFieldPaths(inner, `${path}.${key}`),
  );
}

describe('MODEL_SPEC_READ lenient reader', () => {
  it('accepts the clean spec in both the reader and the writer', () => {
    expect(MODEL_SPEC_READ.safeParse(CLEAN).success).toBe(true);
    expect(MODEL_SPEC.safeParse(CLEAN).success).toBe(true);
  });

  it('accepts an unknown field at the root and at every nested level and drops it', () => {
    const parsed: ModelSpec = MODEL_SPEC_READ.parse(everywhere);
    expect(unknownFieldPaths(parsed)).toEqual([]);
    expect(unknownFieldPaths(everywhere).length).toBeGreaterThanOrEqual(KEYS.length);
    expect(parsed).toEqual(MODEL_SPEC.parse(CLEAN));
  });

  it.each(KEYS)('the writer still refuses an unknown field in %s', (key) => {
    const polluted = spec((where) => (where === key ? EXTRA : {}));
    expect(MODEL_SPEC.safeParse(polluted).success).toBe(false);
    expect(MODEL_SPEC_READ.safeParse(polluted).success).toBe(true);
  });

  it('keeps the same refinements and bounds as the writer', () => {
    const unknownParent = { ...CLEAN, anchors: [{ kind: 'label', id: 'pin', parent: 'nope' }] };
    const tooFar = {
      ...CLEAN,
      footprint: { width: 51, depth: 0.25, height: 1 },
    };
    const lateStill = spec(() => ({}), 5);
    for (const bad of [unknownParent, tooFar, lateStill]) {
      expect(MODEL_SPEC_READ.safeParse(bad).success).toBe(false);
      expect(MODEL_SPEC.safeParse(bad).success).toBe(false);
    }
  });
});
