import {
  HOME_MAP_ROBOT_FURNITURE_MODEL_IDS,
  MODEL_SPEC,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  PLANTS_COMPACT_MODELS,
  PLANTS_LEAFY_MODELS,
  PLANTS_TREE_MODELS,
} from '../../../src/catalogue/plants';
import { HANGING_POTHOS_MODEL } from '../../../src/catalogue/plants/fc27';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const PLANTS: readonly ModelSpec[] = [
  ...PLANTS_LEAFY_MODELS,
  ...PLANTS_COMPACT_MODELS,
  ...PLANTS_TREE_MODELS,
];

const POTS = ['terracotta', 'whiteCeramic', 'blackMatte', 'wovenBasket'];

describe('plants catalogue', () => {
  it.each(PLANTS.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.plants.')).toBe(true);
      expect(spec.category).toBe('plants');
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual(POTS);
      expect(spec.meta?.variants).toStrictEqual(POTS);
      expect(spec.defaultFinish).toBe('terracotta');
      expect(spec.params?.['size']).toMatchObject({ unit: 'ratio', default: 1 });
      expect(spec.channels).toBeUndefined();
    },
  );

  it('collapses no part at any parameter limit', () => {
    expect(PLANTS.flatMap(collapsedParts)).toStrictEqual([]);
  });

  it('holds the fifteen plants of the category', () => {
    expect(new Set(PLANTS.map((spec) => spec.id)).size).toBe(15);
  });

  it('scales every plant uniformly from its root part', () => {
    for (const spec of PLANTS) {
      const root = spec.parts.find((part) => part.parent === undefined);
      const scale = root?.transform?.scale;

      expect(scale, spec.id).toBeDefined();
      expect(scale?.every((axis) => typeof axis === 'object' && axis.param === 'size')).toBe(true);
      expect(spec.parts.filter((part) => part.parent === undefined)).toHaveLength(1);
    }
  });

  it('hangs the pothos from the ceiling', () => {
    expect(HANGING_POTHOS_MODEL.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
      mount: 'ceiling',
    });
  });

  it('covers every plant kind the robot reports', () => {
    const ids = new Set(PLANTS.map((spec) => spec.id));
    const plants = HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.filter((id) => id.startsWith('cat.plants.'));

    expect(plants.filter((id) => !ids.has(id))).toStrictEqual([]);
  });
});
