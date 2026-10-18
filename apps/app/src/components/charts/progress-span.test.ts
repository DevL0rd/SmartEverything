import { describe, expect, it } from 'vitest';
import { MIN_RANGE, markerLeft, spanOf } from './progress-span';

describe('spanOf', () => {
  it('fills from the start up to the clamped progress', () => {
    expect(spanOf(0.4, undefined)).toEqual({ start: 0, end: 0.4 });
    expect(spanOf(2, undefined)).toEqual({ start: 0, end: 1 });
    expect(spanOf(-1, undefined)).toEqual({ start: 0, end: 0 });
  });

  it('fills a range between its two ends', () => {
    expect(spanOf(0.7, 0.2)).toEqual({ start: 0.2, end: 0.7 });
  });

  it('keeps a range visible when both ends meet', () => {
    expect(spanOf(0.5, 0.5)).toEqual({ start: 0.5, end: 0.5 + MIN_RANGE });
    expect(spanOf(0.99, 0.99)).toEqual({ start: 0.99, end: 1 });
  });
});

describe('markerLeft', () => {
  it('centres the marker on its share and keeps it on the bar', () => {
    expect(markerLeft(200, 0.5, 12)).toBe(94);
    expect(markerLeft(200, 3, 12)).toBe(194);
    expect(markerLeft(200, -1, 12)).toBe(-6);
  });
});
