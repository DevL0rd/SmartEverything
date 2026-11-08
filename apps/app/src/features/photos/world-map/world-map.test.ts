import { describe, expect, it } from 'vitest';
import { MINI_MAP_SPAN_DEGREES, MiniMap, NATURAL_EARTH_ATTRIBUTION, WorldMap } from './index';

describe('world map kit', () => {
  it('loads the map components and the attribution the pages show', () => {
    expect(typeof WorldMap).toBe('function');
    expect(typeof MiniMap).toBe('function');
    expect(NATURAL_EARTH_ATTRIBUTION).toBe('Map: Natural Earth, public domain.');
  });

  it('shows about 43 degrees of longitude around a mini map pin, as the viewer design frames Lisbon', () => {
    expect(MINI_MAP_SPAN_DEGREES).toBe(43);
  });
});
