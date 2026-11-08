import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { RUG_MODELS } from '../../../src/catalogue/rugs';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const ALL: readonly ModelSpec[] = RUG_MODELS;

describe('rugs catalogue', () => {
  it('holds the eight rugs of the plan', () => {
    expect(ALL.map((spec) => spec.id)).toStrictEqual([
      'cat.rugs.rug-rectangle',
      'cat.rugs.rug-round',
      'cat.rugs.runner',
      'cat.rugs.shag-rug',
      'cat.rugs.jute-rug',
      'cat.rugs.bath-rug',
      'cat.rugs.door-mat',
      'cat.rugs.outdoor-rug',
    ]);
  });

  it.each(ALL.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.category).toBe('rugs');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(Object.keys(spec.finishes ?? {})).toStrictEqual(spec.meta?.variants);
      expect(Object.keys(spec.finishes ?? {})).toContain(spec.defaultFinish);
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(Object.keys(spec.states ?? {})).toStrictEqual(['rest']);
      expect(collapsedParts(spec)).toStrictEqual([]);
    },
  );

  it('keeps every rug flat and on the floor', () => {
    for (const spec of ALL) {
      expect(spec.footprint.height).toBeLessThanOrEqual(0.07);
      expect(spec.framing.card.pitch).toBe(35);
    }
  });
});
