import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewportRegistry, type Measurable } from './viewport-registry';

function node(measure: () => void): { readonly current: Measurable } {
  return {
    current: {
      measureInWindow: (done): void => {
        measure();
        done(0, 100, 50, 50);
      },
    },
  };
}

describe('ViewportRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('measures members when they join and once when scrolling settles, not while scrolling', () => {
    const measure = vi.fn();
    const registry = new ViewportRegistry({ width: 400, height: 800 }, () => undefined);
    const change = vi.fn();
    registry.join({ ref: node(measure), margin: 0, change });
    expect(measure).toHaveBeenCalledTimes(1);
    for (let offset = 24; offset <= 240; offset += 24) {
      registry.scrolled(offset);
      vi.advanceTimersByTime(50);
    }
    expect(measure).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(measure).toHaveBeenCalledTimes(2);
    expect(change).toHaveBeenCalledWith(true);
  });
});
