import { MODEL_SPEC } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import {
  GALAXY_TAB_S9_ULTRA_MODEL,
  GALAXY_Z_FOLD7_MODEL,
  PHONE_MODELS,
} from '../../../src/devices/phones';

describe('phone and tablet models', () => {
  it.each(PHONE_MODELS.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly and passes every authoring check',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
    },
  );

  it('registers each model once', () => {
    const ids = MODEL_REGISTRY.map((spec) => spec.id);
    for (const spec of PHONE_MODELS) {
      expect(ids.filter((id) => id === spec.id)).toHaveLength(1);
    }
  });

  it('unfolds the Fold7 from folded at fold 0 to flat at fold 1', () => {
    const unfold = GALAXY_Z_FOLD7_MODEL.channels?.find((entry) => entry.id === 'unfold');
    expect(unfold).toMatchObject({ target: 'flap', property: 'rotate', axis: 'z', source: 'fold' });
    expect(unfold?.map).toMatchObject({ type: 'linear', in: [0, 1], out: [0, 180] });
    const flap = GALAXY_Z_FOLD7_MODEL.parts.find((part) => part.id === 'flap');
    expect(flap?.transform?.rotation?.[2]).toBe(-180);
  });

  it('keeps the published footprints', () => {
    expect(GALAXY_Z_FOLD7_MODEL.footprint).toMatchObject({ width: 0.0728, depth: 0.1584 });
    expect(GALAXY_TAB_S9_ULTRA_MODEL.footprint).toStrictEqual({
      width: 0.3264,
      depth: 0.2086,
      height: 0.0055,
    });
  });

  it('gives the tablet a screen overlay anchor', () => {
    const screen = GALAXY_TAB_S9_ULTRA_MODEL.anchors?.find((anchor) => anchor.kind === 'screen');
    expect(screen).toMatchObject({ id: 'display', width: 0.3144, height: 0.1965 });
  });
});
