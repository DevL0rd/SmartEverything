import { MODEL_SPEC } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { COMPUTER_MODELS, ROG_SCAR_18_MODEL } from '../../../src/devices/computers';

describe('computer models', () => {
  it.each(COMPUTER_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly and passes every authoring check',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
    },
  );

  it('registers each model once', () => {
    const ids = MODEL_REGISTRY.map((spec) => spec.id);
    for (const spec of COMPUTER_MODELS) {
      expect(ids.filter((id) => id === spec.id)).toHaveLength(1);
    }
  });

  it('closes the lid on the hinge from the fold signal', () => {
    const fold = ROG_SCAR_18_MODEL.channels?.find((entry) => entry.id === 'lidFold');
    expect(fold).toMatchObject({ target: 'hinge', property: 'rotate', axis: 'x', source: 'fold' });
    expect(fold?.map).toMatchObject({ type: 'linear', in: [0, 1], out: [110, 0] });
    const hinge = ROG_SCAR_18_MODEL.parts.find((part) => part.id === 'hinge');
    expect(hinge?.transform?.rotation?.[0]).toBe(-20);
  });

  it('keeps the true footprint, the screen anchor and a screen shot', () => {
    expect(ROG_SCAR_18_MODEL.footprint).toMatchObject({ width: 0.399, depth: 0.294 });
    expect(ROG_SCAR_18_MODEL.anchors?.find((anchor) => anchor.kind === 'screen')).toBeDefined();
    expect(ROG_SCAR_18_MODEL.shots?.[0]).toMatchObject({ id: 'screen', focus: 'screenGlow' });
  });
});
