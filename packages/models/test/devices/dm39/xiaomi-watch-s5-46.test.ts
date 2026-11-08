import { MODEL_SPEC, shownParts } from '@smarteverything/domain';
import { XIAOMI_WATCH_S5_46_MODEL as WATCH } from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

describe('the Xiaomi Watch S5 46 mm', () => {
  it('parses strictly, passes every authoring check and is registered', () => {
    expect(MODEL_SPEC.safeParse(WATCH).success).toBe(true);
    expect(checkAuthoring(WATCH).problems).toStrictEqual([]);
    expect(MODEL_REGISTRY.map((spec) => spec.id)).toContain('dev.watch.xiaomi-s5-46');
  });

  it('is a 46 mm case 11 mm thick with a 1.48 inch face', () => {
    expect(WATCH.footprint.height).toBe(0.011);
    expect(WATCH.footprint.width).toBeGreaterThan(0.046);
    expect(WATCH.anchors?.find((anchor) => anchor.kind === 'screen')).toMatchObject({
      width: 0.0376,
      height: 0.0376,
    });
  });

  it('matches the live miwear watch row by alias', () => {
    expect(WATCH.meta?.aliases).toContain('miwear.watch.p62g');
  });

  it('keeps the case, glass, lugs, crown, button and straps at tile size', () => {
    const tile = shownParts(WATCH, 0, {}).map((part) => part.id);

    expect(tile).toStrictEqual([
      'case',
      'glass',
      'lugFar',
      'lugNear',
      'crown',
      'button',
      'strapFar',
      'strapNear',
    ]);
  });

  it('lights the face on screenOn and the halo on charging, and moves only on those', () => {
    const sources = (WATCH.channels ?? []).map((channel) => channel.source);

    expect(sources).toStrictEqual(expect.arrayContaining(['screenOn', 'charging', 'online']));
    expect(WATCH.shots?.map((shot) => shot.focus)).toStrictEqual(['glass']);
    expect(WATCH.states?.['idle']?.['screenOn']).toBe(false);
  });
});
