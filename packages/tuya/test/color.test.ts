import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ColorValueError, decodeColor, encodeColor } from '../src';

describe('Tuya colours', () => {
  it('decodes the v2 local hex form', () => {
    expect(decodeColor('v2', '00f003e801f4')).toStrictEqual({
      hue: 240,
      saturation: 100,
      value: 50,
    });
  });

  it('decodes the v1 local hex form from its hue, saturation and value fields', () => {
    expect(decodeColor('v1', 'ff00000000ff80')).toStrictEqual({
      hue: 0,
      saturation: 100,
      value: 50.2,
    });
  });

  it('decodes the cloud form as an object or as JSON text', () => {
    expect(decodeColor('v2', { h: 120, s: 500, v: 1000 })).toStrictEqual({
      hue: 120,
      saturation: 50,
      value: 100,
    });
    expect(decodeColor('v1', '{"h":60,"s":255,"v":0}')).toStrictEqual({
      hue: 60,
      saturation: 100,
      value: 0,
    });
  });

  it('refuses components outside the version range', () => {
    expect(() => decodeColor('v2', '016803e903e8')).toThrow(ColorValueError);
    expect(() => decodeColor('v2', '016903e803e8')).toThrow(ColorValueError);
    expect(() => decodeColor('v2', '0168000003e9')).toThrow(ColorValueError);
    expect(decodeColor('v2', '016803e803e8')).toStrictEqual({
      hue: 360,
      saturation: 100,
      value: 100,
    });
    expect(() => decodeColor('v1', { h: 0, s: 256, v: 0 })).toThrow(ColorValueError);
    expect(() => decodeColor('v1', { h: 0, s: 0, v: 256 })).toThrow(ColorValueError);
  });

  it('refuses anything else, naming the version and form', () => {
    expect(() => decodeColor('v2', 'zz')).toThrow(
      'Expected a Tuya v2 colour as {h,s,v} or 12 hex digits. Received "zz".',
    );
    expect(() => decodeColor('v1', '00f003e801f4')).toThrow(
      'Expected a Tuya v1 colour as {h,s,v} or 14 hex digits. Received "00f003e801f4".',
    );
    expect(() => decodeColor('v2', 'ff00000000ff80')).toThrow(ColorValueError);
    expect(() => decodeColor('v2', '{"h":')).toThrow(ColorValueError);
    expect(() => decodeColor('v2', { h: 1 })).toThrow(ColorValueError);
    expect(() => decodeColor('v2', 5)).toThrow(ColorValueError);
    const error = new ColorValueError('v2', 1);
    expect(error).toMatchObject({ name: 'ColorValueError', version: 'v2', received: 1 });
  });

  it('refuses hex of the wrong length or with stray characters for its version', () => {
    expect(() => decodeColor('v2', '00f003e801f4ff')).toThrow(ColorValueError);
    expect(() => decodeColor('v2', 'zz00f003e801f4')).toThrow(ColorValueError);
    expect(() => decodeColor('v1', '000a000a000a')).toThrow(ColorValueError);
    expect(() => decodeColor('v1', 'ff00000000ff80ff')).toThrow(ColorValueError);
    expect(() => decodeColor('v1', 'zzff00000000ff80')).toThrow(ColorValueError);
  });

  it('names the JSON error when cloud text is not JSON', () => {
    expect(() => decodeColor('v2', '{"h":')).toThrow(/Received "\{\\"h\\":\s\(SyntaxError: /);
  });

  it('accepts hex in either case', () => {
    expect(decodeColor('v2', '00F003E801F4')).toStrictEqual({
      hue: 240,
      saturation: 100,
      value: 50,
    });
  });

  it('encodes for the cloud as integer components', () => {
    expect(encodeColor('v2', { hue: 240.4, saturation: 50, value: 25 }, 'cloud')).toStrictEqual({
      h: 240,
      s: 500,
      v: 250,
    });
    expect(encodeColor('v1', { hue: 10, saturation: 100, value: 50 }, 'cloud')).toStrictEqual({
      h: 10,
      s: 255,
      v: 128,
    });
  });

  it('encodes the local hex forms', () => {
    expect(encodeColor('v2', { hue: 240, saturation: 100, value: 50 }, 'local')).toBe(
      '00f003e801f4',
    );
    expect(encodeColor('v1', { hue: 0, saturation: 100, value: 100 }, 'local')).toBe(
      'ff00000000ffff',
    );
  });

  it('writes the v1 local red, green and blue prefix for every sector of the hue circle', () => {
    const prefix = (hue: number, saturation: number, value: number): string =>
      z
        .string()
        .parse(encodeColor('v1', { hue, saturation, value }, 'local'))
        .slice(0, 6);
    expect(prefix(0, 100, 100)).toBe('ff0000');
    expect(prefix(60, 100, 100)).toBe('ffff00');
    expect(prefix(120, 100, 100)).toBe('00ff00');
    expect(prefix(180, 100, 100)).toBe('00ffff');
    expect(prefix(240, 100, 100)).toBe('0000ff');
    expect(prefix(300, 100, 100)).toBe('ff00ff');
    expect(prefix(30, 50, 80)).toBe('cc9966');
    expect(prefix(0, 0, 40)).toBe('666666');
  });

  it('round trips every v2 colour through the local and cloud forms', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 360 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (h, s, v) => {
          const color = decodeColor('v2', { h, s, v });
          expect(decodeColor('v2', encodeColor('v2', color, 'local'))).toStrictEqual(color);
          expect(encodeColor('v2', color, 'cloud')).toStrictEqual({ h, s, v });
        },
      ),
    );
  });

  it('round trips every v1 colour through the local form', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 360 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (h, s, v) => {
          const color = decodeColor('v1', { h, s, v });
          expect(decodeColor('v1', encodeColor('v1', color, 'local'))).toStrictEqual(color);
        },
      ),
    );
  });
});
