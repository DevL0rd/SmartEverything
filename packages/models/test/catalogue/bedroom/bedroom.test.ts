import {
  HOME_MAP_ROBOT_FURNITURE_MODEL_IDS,
  MODEL_SPEC,
  modelParamValues,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  BEDROOM_BED_MODELS,
  BEDROOM_STORAGE_MODELS,
  BEDROOM_TEXTILE_MODELS,
} from '../../../src/catalogue/bedroom';
import {
  KING_BED_MODEL,
  QUEEN_BED_MODEL,
  SINGLE_BED_MODEL,
} from '../../../src/catalogue/bedroom/fc14';
import { WARDROBE_MODEL } from '../../../src/catalogue/bedroom/fc15';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const BEDROOM: readonly ModelSpec[] = [
  ...BEDROOM_BED_MODELS,
  ...BEDROOM_STORAGE_MODELS,
  ...BEDROOM_TEXTILE_MODELS,
];

function shownIds(spec: ModelSpec, params: Readonly<Record<string, number>>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((part) => part.id);
}

describe('bedroom catalogue', () => {
  it.each(BEDROOM.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.bedroom.')).toBe(true);
      expect(spec.category).toBe('bedroom');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(spec.meta?.variants).toStrictEqual(Object.keys(spec.finishes ?? {}));
      expect(Object.keys(spec.finishes ?? {})).toContain(spec.defaultFinish);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {}).length).toBeGreaterThan(0);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('holds the thirteen items of the category', () => {
    expect(new Set(BEDROOM.map((spec) => spec.id)).size).toBe(13);
  });

  it('covers every bedroom furniture kind the robot reports', () => {
    const ids = new Set(BEDROOM.map((spec) => spec.id));
    const bedroom = HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.filter((id) =>
      id.startsWith('cat.bedroom.'),
    );

    expect(bedroom.length).toBeGreaterThan(0);
    expect(bedroom.filter((id) => !ids.has(id))).toStrictEqual([]);
  });

  it('puts one pillow on the single bed and two on the larger beds', () => {
    const pillows = (spec: ModelSpec): number =>
      shownIds(spec, {}).filter((id) => /^pillow\d$/.test(id)).length;

    expect([SINGLE_BED_MODEL, QUEEN_BED_MODEL, KING_BED_MODEL].map(pillows)).toStrictEqual([
      1, 2, 2,
    ]);
  });

  it('draws exactly the doors asked for and one swing channel per door', () => {
    const leaves = (doors: number): readonly string[] =>
      shownIds(WARDROBE_MODEL, { doors }).filter((id) => id.startsWith('leaf'));

    expect([2, 3, 4].map((doors) => leaves(doors).length)).toStrictEqual([2, 3, 4]);
    expect(shownIds(WARDROBE_MODEL, { doors: 2 })).not.toContain('divider');
    expect(shownIds(WARDROBE_MODEL, { doors: 3 })).toContain('divider');
    expect(WARDROBE_MODEL.channels).toHaveLength(9);
  });

  it('swings left hinged doors forward one way and right hinged the other', () => {
    const swing = (target: string): number | undefined => {
      const map = WARDROBE_MODEL.channels?.find((channel) => channel.target === target)?.map;
      return map?.type === 'linear' ? map.out[1] : undefined;
    };

    expect([swing('pivot21'), swing('pivot22'), swing('pivot41'), swing('pivot42')]).toStrictEqual([
      -95, 95, -95, 95,
    ]);
  });
});
