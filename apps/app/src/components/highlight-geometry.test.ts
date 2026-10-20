import { describe, expect, it } from 'vitest';
import { frameOf, labelFrame, panesAround, ringAround } from './highlight-geometry';

const VIEWPORT = { width: 400, height: 800 };
const BOX = { x: 20, y: 100, width: 200, height: 50 };

describe('highlight geometry', () => {
  it('grows the box into a ring', () => {
    expect(ringAround(BOX)).toEqual({ x: 16, y: 96, width: 208, height: 58 });
  });

  it('leaves a hole where the ring is and covers the rest of the screen', () => {
    const ring = ringAround(BOX);
    const covered = panesAround(ring, VIEWPORT).reduce(
      (area, pane) => area + pane.width * pane.height,
      0,
    );
    expect(covered).toBe(VIEWPORT.width * VIEWPORT.height - ring.width * ring.height);
  });

  it('clips the hole to the screen when the ring runs off the edge', () => {
    const covered = panesAround({ x: -10, y: -10, width: 100, height: 100 }, VIEWPORT).reduce(
      (area, pane) => area + pane.width * pane.height,
      0,
    );
    expect(covered).toBe(VIEWPORT.width * VIEWPORT.height - 90 * 90);
  });

  it('puts the label below the ring when it fits and above when it does not', () => {
    const ring = ringAround(BOX);
    expect(labelFrame(ring, VIEWPORT).top).toBeGreaterThan(ring.y + ring.height);
    const low = ringAround({ x: 20, y: 770, width: 200, height: 20 });
    expect(labelFrame(low, VIEWPORT).top).toBeLessThan(low.y);
  });

  it('spreads a frame evenly', () => {
    expect(frameOf(BOX, 6)).toEqual({ left: 14, top: 94, width: 212, height: 62 });
  });
});
