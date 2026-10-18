import { describe, expect, it } from 'vitest';
import {
  COLOUR_PRESETS,
  STRIP_SWATCHES,
  WHITE_PRESETS,
  matchedPreset,
  presetAction,
  presetById,
  presetPlan,
  presetsOf,
} from './colour-presets';

const AMBER = { hue: 32, saturation: 58, value: 100 };

describe('colour presets', () => {
  it('lists the colour presets the design names, with warm white and ice as whites', () => {
    expect(COLOUR_PRESETS.map((entry) => entry.id)).toEqual([
      'amber',
      'orange',
      'warm-white',
      'ice',
      'pink',
      'violet',
      'teal',
    ]);
    expect(COLOUR_PRESETS.filter((entry) => entry.kelvin !== null).map((e) => e.id)).toEqual([
      'warm-white',
      'ice',
    ]);
  });

  it('gives every white preset a temperature and a caption', () => {
    expect(WHITE_PRESETS.every((entry) => entry.kelvin !== null)).toBe(true);
    expect(STRIP_SWATCHES.white.map((swatch) => swatch.caption)).toEqual([
      'Warm',
      'Soft',
      'Neutral',
      'Daylight',
      'Cool',
    ]);
    expect(STRIP_SWATCHES.white[0]?.label).toBe('Warm 2700 K');
    expect(STRIP_SWATCHES.colour.every((swatch) => swatch.caption === undefined)).toBe(true);
  });

  it('finds a preset by kind and id', () => {
    expect(presetById('colour', 'teal')?.label).toBe('Teal');
    expect(presetById('white', 'teal')).toBeUndefined();
    expect(presetsOf('white')).toBe(WHITE_PRESETS);
  });
});

describe('matchedPreset', () => {
  it('matches a colour within the hue and saturation tolerance', () => {
    const near = { hue: 38, saturation: 66, value: 70 };
    expect(matchedPreset('colour', { mode: 'colour', kelvin: null, colour: near })).toBe('amber');
  });

  it('matches nothing for a custom colour', () => {
    const custom = { hue: 120, saturation: 90, value: 100 };
    expect(matchedPreset('colour', { mode: 'colour', kelvin: null, colour: custom })).toBeNull();
    expect(matchedPreset('colour', { mode: 'colour', kelvin: null, colour: null })).toBeNull();
  });

  it('matches warm white by temperature while the bulb is in white mode', () => {
    expect(matchedPreset('colour', { mode: 'white', kelvin: 2750, colour: AMBER })).toBe(
      'warm-white',
    );
    expect(matchedPreset('colour', { mode: 'white', kelvin: 4000, colour: AMBER })).toBeNull();
    expect(matchedPreset('colour', { mode: 'white', kelvin: null, colour: null })).toBeNull();
  });

  it('matches white presets by temperature on a white-only bulb', () => {
    expect(matchedPreset('white', { mode: 'white', kelvin: 3000, colour: null })).toBe('soft');
    expect(matchedPreset('white', { mode: 'white', kelvin: 3400, colour: null })).toBeNull();
    expect(matchedPreset('white', { mode: 'white', kelvin: null, colour: null })).toBeNull();
  });
});

describe('presetAction', () => {
  it('sets the temperature for a white preset when the bulb has one', () => {
    const warm = presetById('colour', 'warm-white');
    expect(warm && presetAction(warm, true)).toEqual({ part: 'temperature', kelvin: 2700 });
  });

  it('writes the colour of a white preset on a bulb without temperature', () => {
    const ice = presetById('colour', 'ice');
    expect(ice && presetAction(ice, false)).toEqual({ part: 'colour', colour: ice?.colour });
  });

  it('always writes the colour of a hue preset', () => {
    const violet = presetById('colour', 'violet');
    expect(violet && presetAction(violet, true)).toEqual({
      part: 'colour',
      colour: violet?.colour,
    });
  });
});

describe('presetPlan', () => {
  it('turns an off light on together with the preset', () => {
    expect(presetPlan('colour', 'amber', true, true)).toStrictEqual({
      turnOn: true,
      action: { part: 'colour', colour: AMBER },
    });
  });

  it('only sets the preset on a light that is already on', () => {
    expect(presetPlan('white', 'warm', true, false)).toStrictEqual({
      turnOn: false,
      action: { part: 'temperature', kelvin: 2700 },
    });
  });

  it('plans nothing for a preset the strip does not have', () => {
    expect(presetPlan('white', 'teal', true, false)).toBeNull();
  });
});
