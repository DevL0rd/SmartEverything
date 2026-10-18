import { describe, expect, it } from 'vitest';
import { lightStateLine, whiteWord, type LightLineInput } from './light-state-line';

const ON: LightLineInput = {
  online: true,
  seen: null,
  power: 'on',
  level: 60,
  kelvin: null,
  mode: 'white',
};

describe('light state line', () => {
  it('reads the level of a light that is on', () => {
    expect(lightStateLine(ON)).toBe('On · 60 %');
  });

  it('names the white by its temperature', () => {
    expect(lightStateLine({ ...ON, kelvin: 2700 })).toBe('On · 60 % · Warm white');
    expect(lightStateLine({ ...ON, kelvin: 4000 })).toBe('On · 60 % · Neutral white');
    expect(lightStateLine({ ...ON, kelvin: 6000 })).toBe('On · 60 % · Cool white');
  });

  it('switches word exactly above 3300 K and above 4500 K', () => {
    expect(whiteWord(3300)).toBe('Warm white');
    expect(whiteWord(3301)).toBe('Neutral white');
    expect(whiteWord(4500)).toBe('Neutral white');
    expect(whiteWord(4501)).toBe('Cool white');
  });

  it('says Colour instead of a white when the light shows a colour', () => {
    expect(lightStateLine({ ...ON, kelvin: 2700, mode: 'colour' })).toBe('On · 60 % · Colour');
  });

  it('drops the level when the row shows it elsewhere', () => {
    expect(lightStateLine({ ...ON, kelvin: 2700 }, false)).toBe('On · Warm white');
    expect(lightStateLine({ ...ON, level: null }, false)).toBe('On');
  });

  it('reads Off for a light that is off', () => {
    expect(lightStateLine({ ...ON, power: 'off' })).toBe('Off');
  });

  it('reads when an offline light was last seen', () => {
    expect(lightStateLine({ ...ON, online: false, seen: '2 h ago' })).toBe(
      'Offline · seen 2 h ago',
    );
    expect(lightStateLine({ ...ON, online: false })).toBe('Offline');
  });

  it('reads Online while the power is not reported yet', () => {
    expect(lightStateLine({ ...ON, power: 'unknown' })).toBe('Online');
  });
});
