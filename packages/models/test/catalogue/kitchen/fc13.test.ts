import {
  MODEL_SPEC,
  modelParamValues,
  resolveModelBinding,
  shownParts,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  CUTTING_BOARDS_MODEL,
  DISH_RACK_MODEL,
  FRUIT_BOWL_MODEL,
  KITCHEN_ACCESSORY_MODELS,
  KNIFE_BLOCK_MODEL,
} from '../../../src/catalogue/kitchen/fc13';
import { KITCHEN_FINISH_NAMES } from '../../../src/catalogue/kitchen/fc13/kit';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

function shownIds(spec: ModelSpec, params: Readonly<Record<string, number>>): readonly string[] {
  return shownParts(spec, 2, modelParamValues(spec, params)).map((part) => part.id);
}

describe('kitchen accessories', () => {
  it.each(KITCHEN_ACCESSORY_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.kitchen.')).toBe(true);
      expect(spec.category).toBe('kitchen');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual([...KITCHEN_FINISH_NAMES]);
      expect(spec.meta?.variants).toStrictEqual([...KITCHEN_FINISH_NAMES]);
      expect(Object.keys(spec.finishes ?? {})).toContain(spec.defaultFinish);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('draws one board per count and the paddle only with three', () => {
    const boards = (count: number): readonly string[] =>
      shownIds(CUTTING_BOARDS_MODEL, { boards: count }).filter((id) => /^board\d$/.test(id));

    expect([1, 2, 3].map((count) => boards(count).length)).toStrictEqual([1, 2, 3]);
    expect(shownIds(CUTTING_BOARDS_MODEL, { boards: 2 })).not.toContain('paddleHandle');
    expect(shownIds(CUTTING_BOARDS_MODEL, { boards: 3 })).toContain('paddleHandle');
  });

  it('widens the dish rack tray with its width', () => {
    const geometry = DISH_RACK_MODEL.parts.find((part) => part.id === 'tray')?.geometry;
    if (geometry?.type !== 'roundedBox') throw new Error('no tray box');
    const trayWidth = geometry.width;
    const at = (width: number): number =>
      resolveModelBinding(trayWidth, modelParamValues(DISH_RACK_MODEL, { width }));

    expect([at(0.36), at(0.6)]).toStrictEqual([0.36, 0.6]);
  });

  it('keeps the dish rack wire coloured only on coated finishes', () => {
    const finishes = DISH_RACK_MODEL.finishes ?? {};

    expect(finishes['oak']).toStrictEqual({ tray: { finish: 'oak' } });
    expect(finishes['sage']?.['wire']).toMatchObject({ color: '#9CAF98' });
    expect(finishes['stainless']?.['wire']).toStrictEqual({ finish: 'brushed-aluminium' });
  });

  it('scales the bowl with its diameter and leaves the fruit alone', () => {
    const bowl = FRUIT_BOWL_MODEL.parts.find((part) => part.id === 'bowl');
    const scale = bowl?.transform?.scale?.[0];
    if (scale === undefined) throw new Error('bowl has no scale');
    const at = (diameter: number): number =>
      resolveModelBinding(scale, modelParamValues(FRUIT_BOWL_MODEL, { diameter }));

    expect(at(0.32)).toBeCloseTo(1, 6);
    expect(at(0.4)).toBeCloseTo(1.25, 6);
    expect(FRUIT_BOWL_MODEL.parts.find((part) => part.id === 'apple1')?.transform?.scale).toBe(
      undefined,
    );
  });

  it('tilts every knife handle to the slope of the block top', () => {
    const tilts = KNIFE_BLOCK_MODEL.parts
      .filter((part) => /^handle\d$/.test(part.id))
      .map((part) => part.transform?.rotation?.[0]);

    expect(tilts).toHaveLength(4);
    expect(new Set(tilts).size).toBe(1);
    expect(tilts[0]).toBeCloseTo(28.8, 0);
  });
});
