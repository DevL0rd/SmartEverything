import { describe, expect, it } from 'vitest';
import type { PresentedCapability } from '@smarteverything/domain';
import { hsvCss, kelvinCss, presentedColourCss } from './light-colour';

const COLOUR: PresentedCapability = {
  key: 'color',
  label: 'Colour',
  group: 'lighting',
  groupLabel: 'Lighting',
  tier: 'primary',
  role: 'color',
  danger: { tier: 'none' },
  writable: true,
  options: [],
  unit: null,
  states: null,
  clock: null,
  capability: { key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } },
};
const PACKED: PresentedCapability = { ...COLOUR, colorEncoding: 'packed_rgb' };

describe('light colour css', () => {
  it('turns hue and saturation into a bright hsl colour', () => {
    expect(hsvCss({ hue: 200, saturation: 50, value: 100 })).toBe('hsl(200, 100%, 75%)');
    expect(hsvCss({ hue: 120, saturation: 10, value: 100 })).toBe('hsl(120, 100%, 95%)');
  });

  it('never goes darker than the swatch floor', () => {
    expect(hsvCss({ hue: 30, saturation: 100, value: 100 })).toBe('hsl(30, 100%, 55%)');
  });

  it('shows white for no saturation', () => {
    expect(hsvCss({ hue: 0, saturation: 0, value: 100 })).toBe('hsl(0, 0%, 100%)');
  });

  it('shows nothing for a value that is not a colour', () => {
    expect(hsvCss('red')).toBeNull();
    expect(presentedColourCss(COLOUR, 'red')).toBeNull();
    expect(presentedColourCss(COLOUR, undefined)).toBeNull();
  });

  it('shows a stored hue, saturation and value as hsl', () => {
    expect(presentedColourCss(COLOUR, { hue: 200, saturation: 50, value: 100 })).toBe(
      'hsl(200, 100%, 75%)',
    );
  });

  it('shows a packed colour exactly as stored', () => {
    expect(presentedColourCss(PACKED, 0x00ff00)).toBe('#00ff00');
    expect(presentedColourCss(PACKED, 0x0000ff)).toBe('#0000ff');
    expect(presentedColourCss(PACKED, 0x0000ff)).not.toBe(presentedColourCss(COLOUR, 0x0000ff));
  });

  it('turns a colour temperature into a warm to cool hex colour', () => {
    expect(kelvinCss(1000)).toBe('#ff4400');
    expect(kelvinCss(2700)).toBe('#ffa757');
    expect(kelvinCss(4000)).toBe('#ffcea6');
    expect(kelvinCss(6500)).toBe('#fffefa');
    expect(kelvinCss(9000)).toBe('#d2dfff');
    expect(kelvinCss(12000)).toBe('#bfd4ff');
  });

  it('treats anything hotter than the scale as its hottest colour', () => {
    expect(kelvinCss(20000)).toBe(kelvinCss(12000));
  });

  it('shows nothing for a temperature that cannot be a colour', () => {
    expect(kelvinCss(999)).toBeNull();
    expect(kelvinCss(Number.NaN)).toBeNull();
    expect(kelvinCss(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
