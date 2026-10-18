import { describe, expect, it } from 'vitest';
import { barPath, barSlots } from './bar-path';

describe('barPath', () => {
  it('rounds the top corners and keeps the base square', () => {
    const path = barPath({ x: 0, width: 10, top: 0, bottom: 20 }, { top: 3, bottom: 0 });
    expect(path).toContain('A3.00 3.00 0 0 1 3.00 0.00');
    expect(path).toContain('L10.00 20.00');
    expect(path).toContain('L0.00 20.00');
  });

  it('shrinks the radius to the bar height', () => {
    const path = barPath({ x: 0, width: 10, top: 18, bottom: 20 }, { top: 4, bottom: 0 });
    expect(path).toContain('A2.00 2.00');
    expect(path).not.toContain('A4.00');
  });

  it('draws a capsule with both ends half the width', () => {
    const path = barPath({ x: 0, width: 8, top: 0, bottom: 8 }, { top: 4, bottom: 4 });
    expect(path.match(/A4\.00 4\.00 0 0 1/g)).toHaveLength(4);
  });
});

describe('barSlots', () => {
  it('centres each bar in an equal slot with the gap share between bars', () => {
    const slots = barSlots(4, 100, { gap: 0.2, min: 1 });
    expect(slots.map((slot) => slot.width)).toEqual([20, 20, 20, 20]);
    expect(slots.map((slot) => slot.x)).toEqual([2.5, 27.5, 52.5, 77.5]);
  });

  it('clamps the bar width between the minimum and maximum', () => {
    expect(barSlots(50, 100, { gap: 0.2, min: 2 })[0]?.width).toBe(2);
    expect(barSlots(2, 100, { gap: 0.2, min: 2, max: 10 })[0]?.width).toBe(10);
    expect(barSlots(2, 100, { gap: 0.2, min: 2, max: 10 })[0]?.x).toBe(20);
  });

  it('has no slots without bars', () => {
    expect(barSlots(0, 100, { gap: 0.2, min: 1 })).toEqual([]);
  });
});
