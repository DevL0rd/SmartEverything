import { describe, expect, it } from 'vitest';
import { occupancyFits, occupancyPx } from './occupancy-room';

const CAPTIONS = 20;

describe('occupancy graph room', () => {
  it('shows the graph only when its timeline and caption fit the space left in the card', () => {
    expect(occupancyFits(occupancyPx(false, CAPTIONS), false, CAPTIONS)).toBe(true);
    expect(occupancyFits(occupancyPx(false, CAPTIONS) - 1, false, CAPTIONS)).toBe(false);
    expect(occupancyFits(0, true, CAPTIONS)).toBe(false);
  });

  it('needs more room for the wide panel with its time captions', () => {
    expect(occupancyPx(true, CAPTIONS)).toBeGreaterThan(occupancyPx(false, CAPTIONS));
    expect(occupancyFits(occupancyPx(false, CAPTIONS), true, CAPTIONS)).toBe(false);
  });
});
