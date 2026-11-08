import {
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { OUTDOOR_PATIO_MODELS } from '../../../src/catalogue/outdoor/fc23';
import { OUTDOOR_FINISH_NAMES } from '../../../src/catalogue/outdoor/fc23/kit';
import {
  FENCE_PANEL_MODEL,
  HEDGE_MODEL,
  OUTDOOR_GARDEN_MODELS,
  PATH_STONES_MODEL,
} from '../../../src/catalogue/outdoor/fc24';
import { HEDGE_FINISH_NAMES } from '../../../src/catalogue/outdoor/fc24/hedge';
import { STONE_FINISH_NAMES } from '../../../src/catalogue/outdoor/fc24/stones';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const ALL: readonly ModelSpec[] = [...OUTDOOR_PATIO_MODELS, ...OUTDOOR_GARDEN_MODELS];

function finishNames(spec: ModelSpec): readonly string[] {
  if (spec === HEDGE_MODEL) return HEDGE_FINISH_NAMES;
  if (spec === PATH_STONES_MODEL) return STONE_FINISH_NAMES;
  return OUTDOOR_FINISH_NAMES;
}

function shownIds(spec: ModelSpec, params: Readonly<Record<string, number>>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((part) => part.id);
}

describe('outdoor catalogue', () => {
  it('holds the twelve items of the plan', () => {
    expect(ALL.map((spec) => spec.id)).toStrictEqual([
      'cat.outdoor.patio-table',
      'cat.outdoor.patio-chair',
      'cat.outdoor.sun-lounger',
      'cat.outdoor.parasol',
      'cat.outdoor.outdoor-sofa',
      'cat.outdoor.barbecue-grill',
      'cat.outdoor.planter-box',
      'cat.outdoor.raised-bed',
      'cat.outdoor.fence-panel',
      'cat.outdoor.hedge',
      'cat.outdoor.path-stones',
      'cat.outdoor.garden-bench',
    ]);
  });

  it.each(ALL.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      const names = finishNames(spec);
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.category).toBe('outdoor');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual([...names]);
      expect(spec.meta?.variants).toStrictEqual([...names]);
      expect(names).toContain(spec.defaultFinish);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {})).toStrictEqual(['rest']);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('lays one stone per count and no more', () => {
    const stones = (count: number): number =>
      shownIds(PATH_STONES_MODEL, { count }).filter((id) => /^stone\d$/.test(id)).length;

    expect([3, 5, 9].map(stones)).toStrictEqual([3, 5, 9]);
  });

  it('keeps the fence boards the width of their pitch at every length', () => {
    const boards = FENCE_PANEL_MODEL.parts.find((part) => part.id === 'boards')?.geometry;
    if (boards?.type !== 'slats') throw new Error('no board slats');
    const at = (length: number): readonly number[] => {
      const values = modelParamValues(FENCE_PANEL_MODEL, { length });
      return [
        resolveModelBinding(boards.spacing, values),
        resolveModelBinding(boards.height, values),
      ];
    };

    for (const length of [1.2, 1.8, 2.4]) {
      const [pitch = 0, board = 0] = at(length);
      expect(pitch * boards.count).toBeCloseTo(length, 3);
      expect(pitch - board).toBeCloseTo(0.012, 6);
    }
  });
});
