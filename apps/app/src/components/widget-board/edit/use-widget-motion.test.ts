import { describe, expect, it } from 'vitest';
import { animatesPlacement, placedHeight } from './use-widget-motion';

describe('animatesPlacement', () => {
  it('places an unmeasured row without animation', () => {
    expect(animatesPlacement({ left: 0, top: 0, width: 300, height: 0 }, false)).toBe(false);
  });

  it('springs a measured row that moves', () => {
    expect(animatesPlacement({ left: 0, top: 40, width: 300, height: 56 }, false)).toBe(true);
  });

  it('never animates under reduced motion', () => {
    expect(animatesPlacement({ left: 0, top: 40, width: 300, height: 56 }, true)).toBe(false);
  });
});

describe('placedHeight', () => {
  it('leaves an unmeasured row free to take its natural height', () => {
    expect(placedHeight(0)).toBeUndefined();
  });

  it('pins a measured row to its height', () => {
    expect(placedHeight(56)).toBe(56);
  });
});
