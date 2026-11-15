import { describe, expect, it } from 'vitest';
import { wheelPixels, zoomsOn } from './wheel-zoom';

describe('wheel zoom', () => {
  it('reads pixel deltas as they are and line deltas as lines of text', () => {
    expect(wheelPixels(-120, 0)).toBe(-120);
    expect(wheelPixels(3, 1)).toBe(120);
  });

  it('zooms full surfaces on any wheel turn and embedded ones only with Ctrl or a touchpad pinch', () => {
    expect(zoomsOn('wheel', false)).toBe(true);
    expect(zoomsOn('ctrl-wheel', false)).toBe(false);
    expect(zoomsOn('ctrl-wheel', true)).toBe(true);
  });
});
