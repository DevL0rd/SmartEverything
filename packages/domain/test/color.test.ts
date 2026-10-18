import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  hsvToPackedRgb,
  hsvToRgbChannels,
  InvalidValueError,
  packedRgbToHsv,
  readPresentedColor,
  rgbChannelsToHsv,
  writePresentedColor,
} from '../src';

const KNOWN = [
  [
    { r: 255, g: 0, b: 0 },
    { hue: 0, saturation: 100, value: 100 },
  ],
  [
    { r: 0, g: 255, b: 0 },
    { hue: 120, saturation: 100, value: 100 },
  ],
  [
    { r: 0, g: 0, b: 255 },
    { hue: 240, saturation: 100, value: 100 },
  ],
  [
    { r: 255, g: 255, b: 0 },
    { hue: 60, saturation: 100, value: 100 },
  ],
  [
    { r: 0, g: 0, b: 0 },
    { hue: 0, saturation: 0, value: 0 },
  ],
  [
    { r: 255, g: 255, b: 255 },
    { hue: 0, saturation: 0, value: 100 },
  ],
  [
    { r: 255, g: 128, b: 0 },
    { hue: 30, saturation: 100, value: 100 },
  ],
] as const;

describe('colour conversion', () => {
  it('turns channels into hue, saturation and value', () => {
    for (const [channels, hsv] of KNOWN) expect(rgbChannelsToHsv(channels)).toStrictEqual(hsv);
  });

  it('turns hue, saturation and value into whole channels', () => {
    for (const [channels, hsv] of KNOWN) expect(hsvToRgbChannels(hsv)).toStrictEqual(channels);
  });

  it('maps a hue of 360 to the same channels as 0', () => {
    expect(hsvToRgbChannels({ hue: 360, saturation: 100, value: 100 })).toStrictEqual({
      r: 255,
      g: 0,
      b: 0,
    });
  });

  it('packs and unpacks channels into one integer', () => {
    expect(hsvToPackedRgb({ hue: 120, saturation: 100, value: 100 })).toBe(0x00ff00);
    expect(packedRgbToHsv(0x0000ff)).toStrictEqual({ hue: 240, saturation: 100, value: 100 });
  });

  it('round-trips any packed colour to within rounding', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffff }), (packed) => {
        const back = hsvToPackedRgb(packedRgbToHsv(packed));
        for (const shift of [16, 8, 0])
          expect(Math.abs(((back >> shift) & 255) - ((packed >> shift) & 255))).toBeLessThanOrEqual(
            6,
          );
      }),
    );
  });
});

describe('presented colours', () => {
  const PACKED = { colorEncoding: 'packed_rgb' } as const;
  const HSV = { hue: 240, saturation: 100, value: 100 };

  it('reads a colour as stored by the device', () => {
    expect(readPresentedColor({}, HSV)).toStrictEqual(HSV);
    expect(readPresentedColor(PACKED, 0x0000ff)).toStrictEqual(HSV);
  });

  it('reads nothing from a value of the wrong shape', () => {
    expect(readPresentedColor({}, 'blue')).toBeNull();
    expect(readPresentedColor(PACKED, HSV)).toBeNull();
    expect(readPresentedColor(PACKED, 0x1000000)).toBeNull();
    expect(readPresentedColor({}, undefined)).toBeNull();
  });

  it('writes a colour the way the device stores it', () => {
    expect(writePresentedColor({}, HSV)).toStrictEqual(HSV);
    expect(writePresentedColor(PACKED, HSV)).toBe(0x0000ff);
  });

  it('refuses to write a colour outside hue, saturation and value', () => {
    expect(() => writePresentedColor({}, { hue: 400, saturation: 0, value: 0 })).toThrow(
      InvalidValueError,
    );
  });
});
