import { describe, expect, it } from 'vitest';
import type { Spread } from '@smarteverything/domain';
import { COLOUR_PRESETS, colourMatch, stripSwatches, whiteMatch } from './colour-presets';

function spread(min: number, max: number): Spread {
  return { min, max, mean: Math.round((min + max) / 2), perMember: [] };
}

describe('colourMatch', () => {
  it('finds the preset a single shared colour is close to', () => {
    expect(colourMatch([{ hue: 36, saturation: 55, value: 90 }])).toBe('amber');
  });

  it('finds nothing when members differ or the colour is far from every preset', () => {
    expect(colourMatch([])).toBeNull();
    expect(
      colourMatch([
        { hue: 36, saturation: 58, value: 100 },
        { hue: 214, saturation: 20, value: 100 },
      ]),
    ).toBeNull();
    expect(colourMatch([{ hue: 120, saturation: 90, value: 100 }])).toBeNull();
  });
});

describe('whiteMatch', () => {
  it('matches only when every light shares one preset temperature', () => {
    expect(whiteMatch(spread(3000, 3000))).toBe('soft');
    expect(whiteMatch(spread(2700, 3000))).toBeNull();
    expect(whiteMatch(spread(3100, 3100))).toBeNull();
    expect(whiteMatch(null)).toBeNull();
  });
});

describe('stripSwatches', () => {
  it('offers the colour presets for colour lights and captioned white presets otherwise', () => {
    expect(stripSwatches(true)).toHaveLength(COLOUR_PRESETS.length);
    const white = stripSwatches(false);
    expect(white.map((swatch) => swatch.caption)).toStrictEqual([
      'Warm',
      'Soft',
      'Neutral',
      'Daylight',
      'Cool',
    ]);
  });
});
