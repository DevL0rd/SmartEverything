import { describe, expect, it } from 'vitest';
import {
  MODEL_SPEC,
  MODEL_SPEC_READ,
  modelParamValues,
  shownParts,
  stillParts,
  type ModelSpec,
} from '../../src/models/spec';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 };
const ON_STAND = { param: 'mount', scale: -1, offset: 1 };

function sensor(): Record<string, unknown> {
  return {
    schema: 1,
    id: 'dev.sensor.test',
    version: '1.0.0',
    title: 'Sensor',
    category: 'sensor',
    footprint: { width: 0.04, depth: 0.04, height: 0.07 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    params: { mount: { min: 0, max: 1, default: 0, unit: 'count' } },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'foot',
        geometry: { type: 'sphere', radius: 0.01 },
        material: 'body',
        visible: ON_STAND,
      },
      { id: 'cap', parent: 'foot', geometry: { type: 'sphere', radius: 0.005 }, material: 'body' },
      { id: 'body', geometry: { type: 'sphere', radius: 0.02 }, material: 'body' },
      {
        id: 'bracket',
        geometry: { type: 'sphere', radius: 0.01 },
        material: 'body',
        visible: { param: 'mount' },
      },
      { id: 'blur', geometry: { type: 'sphere', radius: 0.02 }, material: 'body' },
    ],
    channels: [
      {
        id: 'spin',
        target: 'body',
        property: 'rotate',
        source: 'speed',
        map: { type: 'speed', in: [0, 1], perSecond: [0, 3] },
        motion: { type: 'spin' },
        reduced: 'hold',
        blur: { part: 'blur', from: 2, to: 3 },
      },
    ],
  };
}

function issues(value: unknown): string[] {
  const result = MODEL_SPEC.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

function parsed(): ModelSpec {
  return MODEL_SPEC.parse(sensor());
}

const ids = (parts: readonly { readonly id: string }[]): string[] => parts.map((part) => part.id);

describe('part visibility from a param', () => {
  it('accepts a visibility binding and a blur layer in the strict writer and the lenient reader', () => {
    expect(issues(sensor())).toEqual([]);
    expect(MODEL_SPEC_READ.safeParse({ ...sensor(), extra: 1 }).success).toBe(true);
  });

  it('shows the stand on the stand mount and the bracket on the wall, children follow the parent', () => {
    const spec = parsed();
    const stand = modelParamValues(spec);
    const wall = modelParamValues(spec, { mount: 1 });
    expect(ids(shownParts(spec, 2, stand))).toEqual(['foot', 'cap', 'body', 'blur']);
    expect(ids(shownParts(spec, 2, wall))).toEqual(['body', 'bracket', 'blur']);
  });

  it('keeps blur layers out of still projections', () => {
    expect(ids(stillParts(parsed(), 1, { mount: 0 }))).toEqual(['foot', 'cap', 'body']);
  });

  it('clamps given params to the declared range', () => {
    expect(modelParamValues(parsed(), { mount: 7, ghost: 1 })).toEqual({ mount: 1 });
  });

  it('refuses a visibility binding to an unknown param', () => {
    const spec = sensor();
    const parts = [
      {
        id: 'p',
        geometry: { type: 'sphere', radius: 0.01 },
        material: 'body',
        visible: { param: 'ghost' },
      },
    ];
    expect(issues({ ...spec, parts, channels: undefined })).toContain('unknown param ghost');
  });

  it('refuses an unknown blur part and a blur that is full before it starts', () => {
    const channel = (blur: unknown): unknown => ({
      ...sensor(),
      channels: [
        {
          id: 'spin',
          target: 'body',
          property: 'rotate',
          source: 'speed',
          map: { type: 'speed', in: [0, 1], perSecond: [0, 3] },
          motion: { type: 'spin' },
          reduced: 'hold',
          blur,
        },
      ],
    });
    expect(issues(channel({ part: 'ghost', from: 2, to: 3 }))).toContain('unknown blur part ghost');
    expect(issues(channel({ part: 'blur', from: 3, to: 3 }))).toContain(
      'a blur layer is full above where it starts',
    );
  });
});
