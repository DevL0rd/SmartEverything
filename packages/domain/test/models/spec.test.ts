import { describe, expect, it } from 'vitest';
import { MODEL_SPEC, MODEL_SPEC_LIMITS, type ModelSpec } from '../../src/models/spec';
import * as domain from '../../src';

const VIEW = { yaw: 30, pitch: 20, fov: 35, padding: 0.1 };

const SHOT = {
  id: 'spinning',
  when: {
    anyOf: [
      {
        allOf: [
          { signal: 'power', op: 'eq', value: true },
          { signal: 'speed', op: 'gt', value: 0 },
        ],
      },
    ],
  },
  focus: 'blades',
  zoom: 2.2,
  yaw: 10,
  pitch: 5,
  orbit: 4,
  easeMs: 400,
  loopS: 1,
  symmetry: 72,
  stillAt: 0.25,
};

const PARTS = [
  {
    id: 'shell',
    geometry: {
      type: 'roundedBox',
      width: 0.25,
      height: { param: 'height', scale: 1 },
      depth: 0.25,
      radius: 0.04,
      segments: 8,
    },
    material: 'body',
    contact: true,
  },
  {
    id: 'blades',
    parent: 'shell',
    geometry: { type: 'cylinder', height: 0.05, topRadius: 0.1, bottomRadius: 0.1 },
    material: 'accent',
    transform: { position: [0, 0.5, 0], rotation: [90, 0, 0] },
    poses: { open: { rotation: [0, 0, 45] } },
    minLod: 1,
  },
];

const CHANNEL = {
  id: 'spin',
  target: 'blades',
  property: 'rotate',
  axis: 'z',
  source: 'speed',
  map: { type: 'speed', in: [0, 100], perSecond: [0, 3] },
  motion: { type: 'spin' },
  reduced: 'hold',
};

const BASE = {
  schema: 1,
  id: 'dev.fan.tower',
  version: '1.0.0',
  title: 'Tower fan',
  category: 'climate',
  family: 'tower_fan',
  footprint: { width: 0.25, depth: 0.25, height: 1 },
  framing: { tile: VIEW, card: VIEW, hero: { ...VIEW, focus: 'blades' } },
  shots: [SHOT],
  meta: {
    names: { display: 'Tower fan', synonyms: ['pedestal fan'] },
    sizeClass: 'medium',
    variants: ['white'],
    aliases: ['home-map.fan'],
  },
  params: { height: { min: 0.6, max: 1.4, default: 1, unit: 'm' } },
  materials: {
    body: { finish: 'surface.white', roughness: 0.4, metalness: 0, pattern: 'perforated' },
    accent: { color: '#334455', opacity: 1 },
  },
  finishes: { black: { body: { color: '#111111' } } },
  defaultFinish: 'black',
  parts: PARTS,
  anchors: [
    { kind: 'mount', id: 'floor', mount: 'floor' },
    { kind: 'emitter', id: 'led', color: '#ffffff', intensity: 0.5, radius: 0.05, parent: 'shell' },
  ],
  channels: [CHANNEL],
  states: { off: { power: false }, on: { power: true, speed: 50 } },
};

function issues(value: unknown): string[] {
  const result = MODEL_SPEC.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

function withPart(base: Record<string, unknown>, id: string, parent?: string): unknown {
  return {
    id,
    ...(parent === undefined ? {} : { parent }),
    geometry: { type: 'sphere', radius: 0.01 },
    material: 'body',
    ...base,
  };
}

function solo(parts: unknown[]): Record<string, unknown> {
  return {
    ...BASE,
    parts,
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    shots: undefined,
    channels: undefined,
    anchors: undefined,
  };
}

function chain(length: number): Record<string, unknown> {
  const parts = Array.from({ length }, (_, index) =>
    withPart({}, `p${String(index)}`, index === 0 ? undefined : `p${String(index - 1)}`),
  );
  return solo(parts);
}

describe('MODEL_SPEC valid documents', () => {
  it('accepts a full spec with shots, fov, meta, params, anchors and channels', () => {
    const spec: ModelSpec = MODEL_SPEC.parse(BASE);
    expect(spec.shots?.[0]).toMatchObject({ loopS: 1, symmetry: 72, stillAt: 0.25 });
    expect(spec.meta?.names.display).toBe('Tower fan');
    expect(spec.parts).toHaveLength(2);
  });

  it('accepts a camera with a field of view and an exact flag', () => {
    const fov = { hDeg: 110, vDeg: 60, rangeM: 8, exact: true };
    const spec = MODEL_SPEC.parse({ ...BASE, id: 'dev.camera.wide', fov });
    expect(spec.fov).toEqual(fov);
  });

  it('accepts a plugin capability as a channel source and a shot signal', () => {
    const base = BASE;
    const channel = { ...CHANNEL, source: { capability: 'vendor.rpm' } };
    expect(issues({ ...base, channels: [channel] })).toEqual([]);
  });

  it('accepts a spec without the optional additions', () => {
    const bare = {
      schema: 1,
      id: 'cat.rug.round',
      version: '0.1.0',
      title: 'Rug',
      category: 'decor',
      footprint: { width: 2, depth: 2, height: 0.02 },
      framing: { tile: VIEW, card: VIEW, hero: VIEW },
      materials: { body: { color: '#aa8866' } },
      parts: [withPart({}, 'only')],
    };
    expect(issues(bare)).toEqual([]);
  });

  it('is exported from the domain index', () => {
    expect(domain.MODEL_SPEC).toBe(MODEL_SPEC);
    expect(domain.MODEL_SPEC_LIMITS.parts).toBe(400);
  });
});

describe('MODEL_SPEC strict writers', () => {
  it('rejects unknown fields at the root and nested', () => {
    expect(issues({ ...BASE, extra: 1 })).not.toEqual([]);
    const shot = { ...SHOT, extra: 1 };
    expect(issues({ ...BASE, shots: [shot] })).not.toEqual([]);
  });

  it('rejects a wrong schema number, a bad id and a bad version', () => {
    expect(issues({ ...BASE, schema: 2 })).not.toEqual([]);
    expect(issues({ ...BASE, id: 'fan.tower' })).not.toEqual([]);
    expect(issues({ ...BASE, version: '1.0' })).not.toEqual([]);
    expect(issues({ ...BASE, family: 'toaster' })).not.toEqual([]);
  });
});

describe('MODEL_SPEC bounds', () => {
  const part = (id: string): unknown => withPart({}, id);

  it('allows 400 parts and refuses 401', () => {
    const ids = (count: number): unknown[] =>
      Array.from({ length: count }, (_, index) => part(`p${String(index)}`));
    expect(issues(solo(ids(MODEL_SPEC_LIMITS.parts)))).toEqual([]);
    expect(issues(solo(ids(MODEL_SPEC_LIMITS.parts + 1)))).not.toEqual([]);
  });

  it('allows a tree 8 deep and refuses 9 deep', () => {
    expect(issues(chain(8))).toEqual([]);
    expect(issues(chain(9))).toContain('tree deeper than the depth limit or cyclic');
  });

  it('refuses a cyclic tree', () => {
    const cyclic = [withPart({}, 'a', 'b'), withPart({}, 'b', 'a')];
    expect(issues(solo(cyclic))).toContain('tree deeper than the depth limit or cyclic');
  });

  it('allows 64 channels and refuses 65', () => {
    const channel = (index: number): unknown => ({
      ...CHANNEL,
      id: `c${String(index)}`,
    });
    const many = (count: number): unknown[] =>
      Array.from({ length: count }, (_, index) => channel(index));
    expect(issues({ ...BASE, channels: many(64) })).toEqual([]);
    expect(issues({ ...BASE, channels: many(65) })).not.toEqual([]);
  });

  it('allows 32 anchors and refuses 33', () => {
    const many = (count: number): unknown[] =>
      Array.from({ length: count }, (_, index) => ({ kind: 'label', id: `a${String(index)}` }));
    expect(issues({ ...BASE, anchors: many(32) })).toEqual([]);
    expect(issues({ ...BASE, anchors: many(33) })).not.toEqual([]);
  });

  it('keeps metres within 50 and finite', () => {
    const at = (x: number): unknown =>
      solo([withPart({ transform: { position: [x, 0, 0] } }, 'only')]);
    expect(issues(at(50))).toEqual([]);
    expect(issues(at(50.01))).not.toEqual([]);
    expect(issues(at(-50.01))).not.toEqual([]);
    expect(issues(at(Number.POSITIVE_INFINITY))).not.toEqual([]);
    expect(issues(at(Number.NaN))).not.toEqual([]);
  });

  it('keeps segments from 3 to 96', () => {
    const seg = (segments: number): unknown =>
      solo([withPart({ geometry: { type: 'sphere', radius: 0.1, segments } }, 'only')]);
    expect(issues(seg(3))).toEqual([]);
    expect(issues(seg(96))).toEqual([]);
    expect(issues(seg(2))).not.toEqual([]);
    expect(issues(seg(97))).not.toEqual([]);
    expect(issues(seg(8.5))).not.toEqual([]);
  });
});

describe('MODEL_SPEC shots and fov', () => {
  const shotWith = (patch: object): unknown => ({
    ...BASE,
    shots: [{ ...SHOT, ...patch }],
  });

  it('requires loopS, symmetry and stillAt', () => {
    for (const key of ['loopS', 'symmetry', 'stillAt']) {
      const shot = Object.fromEntries(Object.entries(SHOT).filter(([name]) => name !== key));
      expect(issues({ ...BASE, shots: [shot] })).not.toEqual([]);
    }
  });

  it('keeps stillAt inside the loop and symmetry within a turn', () => {
    expect(issues(shotWith({ loopS: 2, stillAt: 2 }))).toEqual([]);
    expect(issues(shotWith({ loopS: 1, stillAt: 1.5 }))).toContain('stillAt lies within the loop');
    expect(issues(shotWith({ symmetry: 0 }))).not.toEqual([]);
    expect(issues(shotWith({ symmetry: 361 }))).not.toEqual([]);
    expect(issues(shotWith({ loopS: 0 }))).not.toEqual([]);
  });

  it('refuses a shot whose focus or id is unknown or repeated', () => {
    expect(issues(shotWith({ focus: 'nowhere' }))).toContain('unknown focus nowhere');
    const shot = SHOT;
    expect(issues({ ...BASE, shots: [shot, shot] })).toContain('duplicate id spinning');
  });

  it('refuses an empty condition', () => {
    expect(issues(shotWith({ when: { anyOf: [] } }))).not.toEqual([]);
    expect(issues(shotWith({ when: { anyOf: [{ allOf: [] }] } }))).not.toEqual([]);
  });

  it('bounds the field of view', () => {
    const fov = (patch: object): unknown => ({
      ...BASE,
      fov: { hDeg: 90, vDeg: 50, rangeM: 5, exact: false, ...patch },
    });
    expect(issues(fov({}))).toEqual([]);
    expect(issues(fov({ hDeg: 0 }))).not.toEqual([]);
    expect(issues(fov({ vDeg: 181 }))).not.toEqual([]);
    expect(issues(fov({ rangeM: 51 }))).not.toEqual([]);
    expect(issues({ ...BASE, fov: { hDeg: 90, vDeg: 50, rangeM: 5 } })).not.toEqual([]);
  });
});

describe('MODEL_SPEC references and consistency', () => {
  it('refuses duplicate ids across parts and anchors', () => {
    const anchors = [{ kind: 'label', id: 'shell' }];
    expect(issues({ ...BASE, anchors })).toContain('duplicate id shell');
  });

  it('refuses an unknown parent, material slot, param, target and default finish', () => {
    const base = BASE;
    const parts = PARTS;
    expect(issues({ ...base, parts: [{ ...parts[0], parent: 'ghost' }] })).toContain(
      'unknown parent ghost',
    );
    expect(issues({ ...base, parts: [{ ...parts[0], material: 'ghost' }] })).toContain(
      'unknown material slot ghost',
    );
    const bound = { ...parts[0], transform: { position: [{ param: 'ghost' }, 0, 0] } };
    expect(issues({ ...base, parts: [bound] })).toContain('unknown param ghost');
    const channel = { ...CHANNEL, target: 'ghost' };
    expect(issues({ ...base, channels: [channel] })).toContain('unknown target ghost');
    expect(issues({ ...base, defaultFinish: 'ghost' })).toContain('unknown finish ghost');
    expect(issues({ ...base, anchors: [{ kind: 'label', id: 'l', parent: 'ghost' }] })).toContain(
      'unknown parent ghost',
    );
  });

  it('refuses a finish that overrides a slot the spec does not declare', () => {
    expect(issues({ ...BASE, finishes: { black: { ghost: { color: '#000000' } } } })).toContain(
      'unknown material slot ghost',
    );
  });

  it('needs exactly one of finish or colour per material', () => {
    const both = { ...BASE, materials: { body: { finish: 'a', color: '#000000' } } };
    const neither = { ...BASE, materials: { body: { roughness: 0.5 } } };
    expect(issues(both)).not.toEqual([]);
    expect(issues(neither)).not.toEqual([]);
    expect(issues({ ...BASE, materials: { body: { color: 'red' } } })).not.toEqual([]);
    expect(
      issues({ ...BASE, materials: { body: { color: '#000000', roughness: 1.2 } } }),
    ).not.toEqual([]);
  });

  it('keeps a param default between min and max', () => {
    const params = { height: { min: 1, max: 2, default: 3, unit: 'm' } };
    expect(issues({ ...BASE, params })).toContain('default lies between min and max');
  });

  it('ties a size axis to a metre param whose default gives the footprint', () => {
    const size = (extent: object): unknown => ({ ...BASE, size: { height: extent } });
    expect(issues(size({ param: 'height', extra: 0, resizes: true }))).toEqual([]);
    expect(issues(size({ param: 'height', scale: 0.5, extra: 0.5, resizes: true }))).toEqual([]);
    expect(issues(size({ param: 'reach', extra: 0, resizes: true }))).toContain(
      'unknown param reach',
    );
    expect(issues(size({ param: 'height', extra: 0.12, resizes: true }))).toContain(
      'footprint height differs from the size height gives at its default',
    );
    expect(issues(size({ param: 'height', extra: -2, scale: 3, resizes: true }))).toContain(
      'size height is not positive at the minimum',
    );
    const turns = { ...BASE, params: { height: { min: 0, max: 2, default: 1, unit: 'deg' } } };
    expect(
      issues({ ...turns, size: { height: { param: 'height', extra: 0, resizes: true } } }),
    ).toContain('size param height is not in metres');
  });

  it('refuses a ring whose inner radius reaches the outer radius', () => {
    const ring = (inner: number): unknown =>
      solo([
        withPart({ geometry: { type: 'ring', innerRadius: inner, outerRadius: 0.1 } }, 'ring'),
      ]);
    expect(issues(ring(0.05))).toEqual([]);
    expect(issues(ring(0.1))).toContain('innerRadius is below outerRadius');
  });

  it('starts an extrude path with move', () => {
    const extrude = (path: unknown[]): unknown =>
      solo([withPart({ geometry: { type: 'extrude', path, depth: 0.1 } }, 'e')]);
    const move = { op: 'move', x: 0, y: 0 };
    const line = { op: 'line', x: 1, y: 0 };
    const arc = { op: 'arc', x: 0, y: 1, rx: 1, ry: 1, large: false, sweep: true };
    expect(issues(extrude([move, line, arc]))).toEqual([]);
    expect(issues(extrude([line, move]))).toContain('a path starts with move');
  });
});
