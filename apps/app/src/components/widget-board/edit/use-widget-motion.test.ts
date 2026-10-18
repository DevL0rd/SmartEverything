import { describe, expect, it } from 'vitest';
import { animatesPlacement } from './use-widget-motion';

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
