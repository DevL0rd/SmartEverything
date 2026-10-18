import { describe, expect, it } from 'vitest';
import { BLINK, BREATHE, GLOW, SPIN, loopStyle, opacityOnly } from './loops';

describe('opacityOnly', () => {
  it('marks pure opacity loops so they can be composited from a cached texture', () => {
    expect(opacityOnly(loopStyle({ name: BREATHE, ms: 3200 }, true))).toBe(true);
    expect(opacityOnly(loopStyle({ name: BLINK, ms: 700 }, true))).toBe(true);
  });

  it('keeps loops that scale or rotate re-rasterised so they stay sharp', () => {
    expect(opacityOnly(loopStyle({ name: GLOW, ms: 3200 }, true))).toBe(false);
    expect(opacityOnly(loopStyle({ name: SPIN, ms: 900 }, true))).toBe(false);
  });

  it('is false without a running loop', () => {
    expect(opacityOnly(loopStyle({ name: BREATHE, ms: 3200 }, false))).toBe(false);
    expect(opacityOnly(undefined)).toBe(false);
  });
});
