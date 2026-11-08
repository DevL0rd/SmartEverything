import { SAMSUNG_G9_OLED_49_MODEL } from '@smarteverything/smartthings';
import { MODEL_SPEC, shownParts } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { GENERIC_TV_MODEL, SCREEN_MODELS } from '../../../src/devices/screens';

describe('screens and media models', () => {
  it.each([GENERIC_TV_MODEL, SAMSUNG_G9_OLED_49_MODEL].map((spec) => [spec.id, spec] as const))(
    '%s parses strictly and passes every authoring check',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
    },
  );

  it('registers each model once', () => {
    const ids = MODEL_REGISTRY.map((spec) => spec.id);
    for (const spec of [...SCREEN_MODELS, SAMSUNG_G9_OLED_49_MODEL]) {
      expect(ids.filter((id) => id === spec.id)).toHaveLength(1);
    }
  });

  it('scales the whole television with one size param and hides the stand on a wall', () => {
    expect(GENERIC_TV_MODEL.params?.['size']).toMatchObject({ min: 0.6, max: 1.55, default: 1 });
    const bezel = GENERIC_TV_MODEL.parts.find((part) => part.id === 'bezel');
    expect(bezel?.transform?.scale).toEqual([
      { param: 'size' },
      { param: 'size' },
      { param: 'size' },
    ]);
    const onStand = shownParts(GENERIC_TV_MODEL, 2, { size: 1, mount: 0 }).map((part) => part.id);
    const onWall = shownParts(GENERIC_TV_MODEL, 2, { size: 1, mount: 1 }).map((part) => part.id);
    expect(onStand).toEqual(expect.arrayContaining(['neck', 'base']));
    expect(onWall).not.toContain('neck');
    expect(onWall).not.toContain('base');
  });

  it('keeps the screen anchor and a watch shot on the glow', () => {
    expect(GENERIC_TV_MODEL.anchors?.find((anchor) => anchor.kind === 'screen')).toBeDefined();
    expect(GENERIC_TV_MODEL.shots?.[0]).toMatchObject({ id: 'watch', focus: 'screenGlow' });
  });
});
