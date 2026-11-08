import {
  HOME_MAP_ROBOT_FURNITURE_MODEL_IDS,
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  ARMCHAIR_MODEL,
  LIVING_LOUNGE_MODELS,
  LIVING_SEATING_MODELS,
  LIVING_STORAGE_MODELS,
  RECLINER_MODEL,
  SOFA_2_SEAT_MODEL,
  SOFA_3_SEAT_MODEL,
  UPRIGHT_PIANO_MODEL,
} from '../../../src/catalogue/living';
import { UPHOLSTERY, WOODS } from '../../../src/catalogue/living/fc06/kit';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

const LIVING: readonly ModelSpec[] = [
  ...LIVING_SEATING_MODELS,
  ...LIVING_LOUNGE_MODELS,
  ...LIVING_STORAGE_MODELS,
];

const UPHOLSTERED = [...LIVING_SEATING_MODELS, ...LIVING_LOUNGE_MODELS.slice(0, 4)];
const WOODEN = [...LIVING_LOUNGE_MODELS.slice(4), ...LIVING_STORAGE_MODELS.slice(0, 5)];

function rotationX(spec: ModelSpec, id: string, recline: number): number {
  const transform = spec.parts.find((entry) => entry.id === id)?.transform;
  const value = transform?.rotation?.[0];
  if (value === undefined) throw new Error(`${id} has no rotation`);
  return resolveModelBinding(value, modelParamValues(spec, { recline }));
}

describe('living room catalogue', () => {
  it.each(LIVING.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.living.')).toBe(true);
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(spec.meta?.variants).toStrictEqual(Object.keys(spec.finishes ?? {}));
    },
  );

  it('holds the eighteen items of the category', () => {
    expect(new Set(LIVING.map((spec) => spec.id)).size).toBe(18);
  });

  it('gives every upholstered item the fabric and leather finishes', () => {
    for (const spec of UPHOLSTERED) {
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual([...UPHOLSTERY]);
    }
  });

  it('gives every wooden item the oak, walnut and white lacquer finishes', () => {
    for (const spec of WOODEN) expect(Object.keys(spec.finishes ?? {})).toStrictEqual([...WOODS]);
    expect(Object.keys(UPRIGHT_PIANO_MODEL.finishes ?? {})).toStrictEqual([
      'black',
      'walnut',
      'white-lacquer',
    ]);
  });

  it('draws one seat cushion per seat', () => {
    const seats = (spec: ModelSpec): number =>
      shownParts(spec, 0, modelParamValues(spec)).filter((entry) => /^seat\d$/.test(entry.id))
        .length;

    expect([ARMCHAIR_MODEL, SOFA_2_SEAT_MODEL, SOFA_3_SEAT_MODEL].map(seats)).toStrictEqual([
      1, 2, 3,
    ]);
  });

  it('tilts the recliner back and raises the footrest flat at full recline', () => {
    expect(rotationX(RECLINER_MODEL, 'backHinge', 0)).toBe(-6);
    expect(rotationX(RECLINER_MODEL, 'backHinge', 45)).toBe(-51);
    expect(rotationX(RECLINER_MODEL, 'footHinge', 0)).toBe(90);
    expect(rotationX(RECLINER_MODEL, 'footHinge', 45)).toBe(0);
  });

  it('covers every living room furniture kind the robot reports', () => {
    const ids = new Set(LIVING.map((spec) => spec.id));
    const living = HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.filter((id) => id.startsWith('cat.living.'));

    expect(living.filter((id) => !ids.has(id))).toStrictEqual([]);
  });
});
