import {
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  DUMBBELL_RACK_MODEL,
  EASEL_MODEL,
  FITNESS_GEAR_MODELS,
  HOBBY_MODELS,
  MUSIC_STAND_MODEL,
  PUNCHING_BAG_MODEL,
  SEWING_TABLE_MODEL,
  WEIGHT_BENCH_MODEL,
} from '../../../src/catalogue/fitness-hobby';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const ALL: readonly ModelSpec[] = [...FITNESS_GEAR_MODELS, ...HOBBY_MODELS];

function shownIds(spec: ModelSpec, params: Readonly<Record<string, number>>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((part) => part.id);
}

function height(spec: ModelSpec, id: string, params: Readonly<Record<string, number>>): number {
  const position = spec.parts.find((part) => part.id === id)?.transform?.position?.[1];
  if (position === undefined) throw new Error(`${id} has no position`);
  return resolveModelBinding(position, modelParamValues(spec, params));
}

describe('fitness and hobby catalogue', () => {
  it('holds the eight items of the category', () => {
    expect(ALL.map((spec) => spec.id)).toStrictEqual([
      'cat.fitness-hobby.yoga-mat',
      'cat.fitness-hobby.dumbbell-rack',
      'cat.fitness-hobby.weight-bench',
      'cat.fitness-hobby.punching-bag',
      'cat.fitness-hobby.bicycle',
      'cat.fitness-hobby.music-stand',
      'cat.fitness-hobby.easel',
      'cat.fitness-hobby.sewing-table',
    ]);
  });

  it.each(ALL.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.category).toBe('fitness-hobby');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(spec.meta?.variants).toStrictEqual(Object.keys(spec.finishes ?? {}));
      expect(Object.keys(spec.finishes ?? {})).toContain(spec.defaultFinish);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {})).toStrictEqual(['rest']);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('keeps part ids unique inside every model', () => {
    for (const spec of ALL) {
      expect(new Set(spec.parts.map((part) => part.id)).size).toBe(spec.parts.length);
    }
  });

  it('racks exactly the requested number of dumbbell pairs on both tiers', () => {
    for (const pairs of [3, 5, 6]) {
      const handles = shownIds(DUMBBELL_RACK_MODEL, { pairs }).filter((id) =>
        id.startsWith('handle'),
      );
      expect(handles).toHaveLength(pairs * 2);
    }
  });

  it('hangs the punching bag from a boom that rises with the height', () => {
    expect(
      height(PUNCHING_BAG_MODEL, 'bag', { height: 2.4 }) -
        height(PUNCHING_BAG_MODEL, 'bag', { height: 1.8 }),
    ).toBeCloseTo(0.6);
  });

  it('lengthens the weight bench back pad with the bench', () => {
    const geometry = WEIGHT_BENCH_MODEL.parts.find((part) => part.id === 'backPad')?.geometry;
    if (geometry?.type !== 'roundedBox') throw new Error('back pad is not a box');
    const values = (length: number): number =>
      resolveModelBinding(geometry.depth, modelParamValues(WEIGHT_BENCH_MODEL, { length }));

    expect(values(1.4) - values(1)).toBeCloseTo(0.4);
  });

  it('raises the music stand desk and the easel mast with their heights', () => {
    expect(
      height(MUSIC_STAND_MODEL, 'desk', { height: 1.6 }) -
        height(MUSIC_STAND_MODEL, 'desk', { height: 0.7 }),
    ).toBeCloseTo(0.9);
    expect(
      height(EASEL_MODEL, 'mast', { height: 1.9 }) - height(EASEL_MODEL, 'mast', { height: 1.55 }),
    ).toBeCloseTo(0.175);
  });

  it('widens the sewing table top with its width', () => {
    const geometry = SEWING_TABLE_MODEL.parts.find((part) => part.id === 'top')?.geometry;
    if (geometry?.type !== 'roundedBox') throw new Error('top is not a box');
    const wide = resolveModelBinding(
      geometry.width,
      modelParamValues(SEWING_TABLE_MODEL, { width: 1.4 }),
    );

    expect(wide).toBeCloseTo(1.4);
  });
});
