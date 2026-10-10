import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MiotSpecError,
  MiotValueError,
  TEXT_MAX_LENGTH,
  describeProperty,
  fromDevice,
  hsvToRgb,
  rgbToHsv,
  toDevice,
  type MiotProperty,
  type ValueCodec,
} from '../src';

function property(shape: Partial<MiotProperty>): MiotProperty {
  return {
    iid: 1,
    type: 'urn:miot-spec-v2:property:x:00000001:m:1',
    description: 'x',
    format: 'uint8',
    access: ['read'],
    ...shape,
  };
}

describe('value descriptors', () => {
  it('turn a value-list into an enum, disambiguating repeated or blank descriptions', () => {
    const described = describeProperty(
      property({
        'value-list': [
          { value: 0, description: 'Auto' },
          { value: 1, description: ' Auto ' },
          { value: 2, description: '' },
          { value: 3, description: 'Auto' },
        ],
      }),
    );
    expect(described.descriptor).toStrictEqual({
      kind: 'enum',
      options: ['Auto', 'Auto (1)', '2', 'Auto (3)'],
    });
  });

  it('pair every descriptor with the codec that converts its values', () => {
    expect(describeProperty(property({ format: 'bool' })).codec).toStrictEqual({ kind: 'boolean' });
    expect(describeProperty(property({ format: 'string' })).codec).toStrictEqual({ kind: 'text' });
    expect(describeProperty(property({ format: 'uint8' })).codec).toStrictEqual({ kind: 'number' });
    expect(
      describeProperty(property({ 'value-list': [{ value: 4, description: 'Four' }] })).codec,
    ).toStrictEqual({ kind: 'enum', options: [{ label: 'Four', value: 4 }] });
  });

  it('treat an empty value-list like no list', () => {
    expect(
      describeProperty(property({ format: 'bool', 'value-list': [] })).descriptor,
    ).toStrictEqual({
      kind: 'boolean',
    });
  });

  it('turn strings and hex into text', () => {
    for (const format of ['string', 'hex'] as const) {
      expect(describeProperty(property({ format })).descriptor).toStrictEqual({
        kind: 'text',
        maxLength: TEXT_MAX_LENGTH,
      });
    }
    expect(TEXT_MAX_LENGTH).toBe(4096);
  });

  it('turn a value-range into a number with step and readable unit', () => {
    const units = {
      percentage: '%',
      celsius: '°C',
      fahrenheit: '°F',
      kelvin: 'K',
      lux: 'lx',
      seconds: 's',
      minutes: 'min',
      hours: 'h',
      days: 'd',
      'μg/m3': 'µg/m³',
      'mg/m3': 'mg/m³',
      ppm: 'ppm',
    } as const;
    for (const [unit, shown] of Object.entries(units)) {
      expect(
        describeProperty(property({ format: 'float', unit, 'value-range': [-1, 2, 0.5] }))
          .descriptor,
      ).toStrictEqual({ kind: 'number', min: -1, max: 2, step: 0.5, unit: shown });
    }
    for (const unit of ['none', '', undefined]) {
      const shape = unit === undefined ? {} : { unit };
      expect(
        describeProperty(property({ ...shape, 'value-range': [0, 1, 1] })).descriptor,
      ).toStrictEqual({
        kind: 'number',
        min: 0,
        max: 1,
        step: 1,
      });
    }
  });

  it('use the format bounds of integers without a range', () => {
    const bounds = [
      ['uint8', 0, 255],
      ['uint16', 0, 65535],
      ['uint32', 0, 4294967295],
      ['int8', -128, 127],
      ['int16', -32768, 32767],
      ['int32', -2147483648, 2147483647],
      ['int64', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ] as const;
    for (const [format, min, max] of bounds) {
      expect(describeProperty(property({ format })).descriptor).toStrictEqual({
        kind: 'number',
        min,
        max,
        step: 1,
      });
    }
  });

  it('refuse floats without a range and ranges that cannot hold a value', () => {
    expect(() => describeProperty(property({ format: 'float' }))).toThrow(
      new MiotSpecError(
        'urn:miot-spec-v2:property:x:00000001:m:1',
        'a value-range for a float',
        'none',
      ),
    );
    const ranges: [number, number, number][] = [
      [0, 1, 0],
      [0, 1, -1],
      [2, 1, 1],
    ];
    for (const range of ranges) {
      expect(() => describeProperty(property({ 'value-range': range }))).toThrow(
        new MiotSpecError(
          'urn:miot-spec-v2:property:x:00000001:m:1',
          'a range with min ≤ max and a positive step',
          `[${range.join(', ')}]`,
        ),
      );
    }
    expect(describeProperty(property({ 'value-range': [1, 1, 1] })).descriptor).toMatchObject({
      min: 1,
      max: 1,
    });
  });
});

const enumCodec: ValueCodec = {
  kind: 'enum',
  options: [
    { label: 'Low', value: 1 },
    { label: 'High', value: 2 },
  ],
};

describe('converting values from the device', () => {
  it('accepts booleans and 0 or 1 for booleans', () => {
    const codec: ValueCodec = { kind: 'boolean' };
    expect(fromDevice('s', codec, true)).toBe(true);
    expect(fromDevice('s', codec, false)).toBe(false);
    expect(fromDevice('s', codec, 1)).toBe(true);
    expect(fromDevice('s', codec, 0)).toBe(false);
    expect(() => fromDevice('s', codec, 2)).toThrow(
      new MiotValueError('s', 'true, false, 0 or 1', 2),
    );
  });

  it('reads an inverted boolean the other way round, as a door sensor reports contact', () => {
    const codec: ValueCodec = { kind: 'inverted-boolean' };
    expect(fromDevice('s', codec, true)).toBe(false);
    expect(fromDevice('s', codec, false)).toBe(true);
    expect(fromDevice('s', codec, 1)).toBe(false);
    expect(fromDevice('s', codec, 0)).toBe(true);
    expect(() => fromDevice('s', codec, 'open')).toThrow(
      new MiotValueError('s', 'true, false, 0 or 1', 'open'),
    );
  });

  it('turns enum numbers into labels', () => {
    expect(fromDevice('s', enumCodec, 2)).toBe('High');
    expect(() => fromDevice('s', enumCodec, 3)).toThrow(new MiotValueError('s', 'one of 1, 2', 3));
  });

  it('passes finite numbers and text through', () => {
    expect(fromDevice('s', { kind: 'number' }, 2.5)).toBe(2.5);
    expect(() => fromDevice('s', { kind: 'number' }, Number.NaN)).toThrow(
      new MiotValueError('s', 'a finite number', Number.NaN),
    );
    expect(() => fromDevice('s', { kind: 'number' }, '1')).toThrow(MiotValueError);
    expect(fromDevice('s', { kind: 'text' }, 'hi')).toBe('hi');
    expect(() => fromDevice('s', { kind: 'text' }, 1)).toThrow(new MiotValueError('s', 'text', 1));
  });

  it('turns RGB integers into hue, saturation and value', () => {
    expect(fromDevice('s', { kind: 'color' }, 0xff0000)).toStrictEqual({
      hue: 0,
      saturation: 100,
      value: 100,
    });
    expect(() => fromDevice('s', { kind: 'color' }, 'red')).toThrow(MiotValueError);
  });
});

describe('converting values to the device', () => {
  it('turns enum labels into numbers', () => {
    expect(toDevice('s', enumCodec, 'Low')).toBe(1);
    expect(() => toDevice('s', enumCodec, 'Max')).toThrow(
      new MiotValueError('s', 'one of Low, High', 'Max'),
    );
  });

  it('turns colours into RGB integers and passes other kinds through', () => {
    expect(toDevice('s', { kind: 'color' }, { hue: 120, saturation: 100, value: 100 })).toBe(
      0x00ff00,
    );
    expect(() => toDevice('s', { kind: 'color' }, 'green')).toThrow(
      new MiotValueError('s', 'a hue, saturation and value', 'green'),
    );
    expect(toDevice('s', { kind: 'boolean' }, true)).toBe(true);
    expect(toDevice('s', { kind: 'inverted-boolean' }, true)).toBe(false);
    expect(toDevice('s', { kind: 'inverted-boolean' }, false)).toBe(true);
    expect(() => toDevice('s', { kind: 'inverted-boolean' }, 1)).toThrow(
      new MiotValueError('s', 'true or false', 1),
    );
    expect(toDevice('s', { kind: 'number' }, 4)).toBe(4);
    expect(toDevice('s', { kind: 'text' }, 'x')).toBe('x');
  });
});

describe('colour conversion', () => {
  it('knows the primary and secondary colours, black, white and grey', () => {
    const known = [
      [0xff0000, 0, 100, 100],
      [0x00ff00, 120, 100, 100],
      [0x0000ff, 240, 100, 100],
      [0xffff00, 60, 100, 100],
      [0x00ffff, 180, 100, 100],
      [0xff00ff, 300, 100, 100],
      [0x000000, 0, 0, 0],
      [0xffffff, 0, 0, 100],
      [0x808080, 0, 0, 50],
      [0xff8000, 30, 100, 100],
      [0x7f3f3f, 0, 50, 50],
    ] as const;
    for (const [rgb, hue, saturation, value] of known) {
      expect(rgbToHsv(rgb)).toStrictEqual({ hue, saturation, value });
      expect(hsvToRgb('s', { hue, saturation, value })).toBe(
        rgb === 0x808080 ? 0x808080 : rgb === 0x7f3f3f ? 0x804040 : rgb,
      );
    }
  });

  it('round-trips any RGB colour to within rounding', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffff }), (rgb) => {
        const back = hsvToRgb('s', rgbToHsv(rgb));
        for (const shift of [16, 8, 0]) {
          expect(Math.abs(((back >> shift) & 255) - ((rgb >> shift) & 255))).toBeLessThanOrEqual(6);
        }
      }),
    );
  });

  it('maps a hue of 360 to the same colour as 0', () => {
    expect(hsvToRgb('s', { hue: 360, saturation: 100, value: 100 })).toBe(0xff0000);
  });
});
