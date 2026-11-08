import {
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  BIRD_CAGE_MODEL,
  CAT_TREE_MODEL,
  DOG_BED_MODEL,
  KIDS_ROOM_MODELS,
  PET_CRATE_MODEL,
  PET_MODELS,
} from '../../../src/catalogue/kids-pets';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const ALL: readonly ModelSpec[] = [...KIDS_ROOM_MODELS, ...PET_MODELS];

function shownIds(spec: ModelSpec, params: Readonly<Record<string, number>>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((part) => part.id);
}

function top(spec: ModelSpec, id: string, params: Readonly<Record<string, number>>): number {
  const position = spec.parts.find((part) => part.id === id)?.transform?.position?.[1];
  if (position === undefined) throw new Error(`${id} has no position`);
  return resolveModelBinding(position, modelParamValues(spec, params));
}

describe('kids and pets catalogue', () => {
  it('holds the nine items of the category', () => {
    expect(ALL.map((spec) => spec.id)).toStrictEqual([
      'cat.kids-pets.toy-chest',
      'cat.kids-pets.kids-table',
      'cat.kids-pets.play-mat',
      'cat.kids-pets.high-chair',
      'cat.kids-pets.dog-bed',
      'cat.kids-pets.cat-tree',
      'cat.kids-pets.pet-crate',
      'cat.kids-pets.aquarium-stand',
      'cat.kids-pets.bird-cage',
    ]);
  });

  it.each(ALL.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.category).toBe('kids-pets');
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

  it('keeps ids and part ids unique', () => {
    expect(new Set(ALL.map((spec) => spec.id)).size).toBe(ALL.length);
    for (const spec of ALL) {
      expect(new Set(spec.parts.map((part) => part.id)).size).toBe(spec.parts.length);
    }
  });

  it('shows exactly the requested number of bars on the crate front', () => {
    for (const bars of [8, 10, 14]) {
      const front = shownIds(PET_CRATE_MODEL, { bars }).filter((id) => id.startsWith('barFront'));
      expect(front).toHaveLength(bars);
    }
  });

  it('lifts the cat tree perch with its height', () => {
    expect(
      top(CAT_TREE_MODEL, 'perch', { height: 1.9 }) - top(CAT_TREE_MODEL, 'perch', { height: 1 }),
    ).toBeCloseTo(0.9);
  });

  it('lifts the bird cage with the stand', () => {
    expect(
      top(BIRD_CAGE_MODEL, 'tray', { stand: 0.9 }) - top(BIRD_CAGE_MODEL, 'tray', { stand: 0.5 }),
    ).toBeCloseTo(0.4);
  });

  it('widens the dog bed bolster with its size', () => {
    const geometry = DOG_BED_MODEL.parts.find((part) => part.id === 'bolster')?.geometry;
    if (geometry?.type !== 'torus') throw new Error('bolster is not a torus');
    const small = resolveModelBinding(
      geometry.radius,
      modelParamValues(DOG_BED_MODEL, { size: 0.5 }),
    );
    const large = resolveModelBinding(
      geometry.radius,
      modelParamValues(DOG_BED_MODEL, { size: 1.2 }),
    );
    expect(large - small).toBeCloseTo(0.35);
  });
});
