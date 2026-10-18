import { describe, expect, it } from 'vitest';
import { medallionGeometry, ringValue } from './medallion-model';

describe('medallionGeometry', () => {
  it('sizes the hero 96 on touch, 112 with a pointer and the widget mark 48', () => {
    expect(medallionGeometry('hero', false).px).toBe(96);
    expect(medallionGeometry('hero', true).px).toBe(112);
    expect(medallionGeometry('widget', true).px).toBe(48);
  });

  it('keeps the card medallion at 96 on every idiom with the hero proportions', () => {
    expect(medallionGeometry('cell', true).px).toBe(96);
    expect(medallionGeometry('cell', false).thickness).toBe(4);
    expect(medallionGeometry('cell', false).glyph).toBe(40);
  });

  it('puts the status dot on the ring edge at 45 degrees, centred on its own size', () => {
    const { px, dot, dotLeft, dotTop, thickness } = medallionGeometry('hero', false);
    expect(dotLeft + dot / 2).toBeCloseTo(px * 0.853);
    expect(dotTop + dot / 2).toBeCloseTo(px * 0.147);
    expect(thickness).toBe(4);
    expect(medallionGeometry('widget', false).thickness).toBe(3);
  });

  it('lets the glow overshoot the disc evenly on every side', () => {
    const { px, glowInset, glowSpan } = medallionGeometry('hero', false);
    expect(glowInset).toBeCloseTo(-px * 0.3);
    expect(glowSpan).toBeCloseTo(px * 1.6);
  });
});

describe('ringValue', () => {
  it('clamps the ratio into the ring', () => {
    expect(ringValue(0.21, false)).toBe(0.21);
    expect(ringValue(1.4, false)).toBe(1);
    expect(ringValue(-0.2, false)).toBe(0);
  });

  it('empties the ring when there is no ratio or the service is offline', () => {
    expect(ringValue(null, false)).toBe(0);
    expect(ringValue(0.9, true)).toBe(0);
  });
});
