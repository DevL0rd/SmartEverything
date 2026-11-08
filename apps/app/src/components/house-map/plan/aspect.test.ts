import { describe, expect, it } from 'vitest';
import { mapAspectClass } from './aspect';

describe('mapAspectClass', () => {
  it('follows the home shape in steps and falls back for an empty map', () => {
    expect(mapAspectClass({ minX: 0, minY: 0, maxX: 10, maxY: 5 })).toBe('aspect-video');
    expect(mapAspectClass({ minX: 0, minY: 0, maxX: 5, maxY: 5 })).toBe('aspect-square');
    expect(mapAspectClass({ minX: 0, minY: 0, maxX: 4, maxY: 10 })).toBe('aspect-3/4');
    expect(mapAspectClass({ minX: 0, minY: 0, maxX: 0, maxY: 0 })).toBe('aspect-4/3');
  });
});
