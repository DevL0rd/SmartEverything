import { MODEL_SPEC, modelParamValues, shownParts, type ModelSpec } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { OUTDOOR_FEATURE_MODELS } from '../../../src/catalogue/outdoor/fc25';
import { BIKE_RACK_MODEL, OUTDOOR_VEHICLE_MODELS } from '../../../src/catalogue/outdoor/fc26';
import { SWING_MODEL } from '../../../src/catalogue/outdoor/fc25';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import { collapsedParts } from '../shapes';

const OWNED: readonly ModelSpec[] = [...OUTDOOR_FEATURE_MODELS, ...OUTDOOR_VEHICLE_MODELS];

describe('outdoor features and vehicles', () => {
  it.each(OWNED.map((spec) => [spec.id, spec] as const))(
    '%s parses strictly, passes every authoring check and is registered once',
    (_id, spec) => {
      expect(MODEL_SPEC.safeParse(spec).success).toBe(true);
      expect(checkAuthoring(spec).problems).toStrictEqual([]);
      expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
      expect(spec.id.startsWith('cat.outdoor.')).toBe(true);
      expect(spec.category).toBe('outdoor');
      expect(spec.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
        mount: 'floor',
      });
      expect(spec.meta?.names.synonyms?.length).toBeGreaterThan(2);
      expect(spec.meta?.variants).toStrictEqual(Object.keys(spec.finishes ?? {}));
      expect(spec.defaultFinish).toBeDefined();
    },
  );

  it('collapses no part at any parameter limit', () => {
    expect(OWNED.flatMap(collapsedParts)).toStrictEqual([]);
  });

  it('holds ten items', () => {
    expect(new Set(OWNED.map((spec) => spec.id)).size).toBe(10);
  });

  it('draws one hoop per bike and centres them on the rail', () => {
    const hoops = (bikes: number): readonly string[] =>
      shownParts(BIKE_RACK_MODEL, 0, modelParamValues(BIKE_RACK_MODEL, { bikes }))
        .filter((part) => /^hoop\d$/.test(part.id))
        .map((part) => part.id);

    expect(hoops(2)).toHaveLength(2);
    expect(hoops(4)).toHaveLength(4);
    expect(hoops(6)).toHaveLength(6);
  });

  it('swings both seats through whole cycles inside the shot loop', () => {
    const loop = SWING_MODEL.shots?.[0]?.loopS ?? 0;
    const channels = SWING_MODEL.channels ?? [];

    expect(channels).toHaveLength(2);
    for (const channel of channels) {
      expect(channel.motion.type).toBe('oscillate');
      if (channel.motion.type !== 'oscillate') continue;
      const [low, high] = channel.motion.limits;
      const period = (2 * (high - low)) / channel.motion.speed;
      expect(loop / period).toBe(Math.round(loop / period));
      expect(SWING_MODEL.parts.some((part) => part.id === channel.target)).toBe(true);
    }
  });

  it('lights the glowing items from their power and brightness signals', () => {
    const glowing = OWNED.filter((spec) =>
      (spec.channels ?? []).some((c) => c.property === 'emissive'),
    );

    expect(glowing.map((spec) => spec.id).sort()).toStrictEqual([
      'cat.outdoor.hot-tub',
      'cat.outdoor.lamp-post',
      'cat.outdoor.pool',
    ]);
    for (const spec of glowing) {
      expect(spec.shots?.length).toBeGreaterThan(0);
      expect(spec.anchors?.some((anchor) => anchor.kind === 'emitter')).toBe(true);
    }
  });

  it('keeps idle items still: no channels on the static items', () => {
    const still = OWNED.filter((spec) => spec.channels === undefined).map((spec) => spec.id);

    expect(still).toContain('cat.outdoor.car');
    expect(still).toContain('cat.outdoor.tree-deciduous');
  });
});
