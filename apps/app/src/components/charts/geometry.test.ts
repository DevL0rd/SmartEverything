import { describe, expect, it } from 'vitest';
import { arcLength, arcPath, circlePath, pointOn } from './geometry';

const RING = { cx: 50, cy: 50, r: 20 };

describe('arc geometry', () => {
  it('measures degrees clockwise from the top', () => {
    expect(pointOn(RING, 0)).toEqual({ x: 50, y: 30 });
    const right = pointOn(RING, 90);
    expect([Math.round(right.x), Math.round(right.y)]).toEqual([70, 50]);
  });

  it('draws a short arc and a large arc past half a turn', () => {
    expect(arcPath(RING, 0, 90)).toBe('M50.00 30.00 A20 20 0 0 1 70.00 50.00');
    expect(arcPath(RING, 0, 270)).toBe('M50.00 30.00 A20 20 0 1 1 30.00 50.00');
  });

  it('closes a full turn as two half arcs', () => {
    expect(arcPath(RING, 0, 360)).toBe(
      'M50.00 30.00 A20 20 0 1 1 50.00 70.00 A20 20 0 1 1 50.00 30.00',
    );
    expect(circlePath(RING)).toBe(`${arcPath(RING, 0, 360)} Z`);
  });

  it('caps the dash length at one full circumference', () => {
    expect(arcLength(10, 720)).toBeCloseTo(2 * Math.PI * 10);
  });
});
