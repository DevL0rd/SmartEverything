import fc from 'fast-check';
import { InvalidValueError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  DataPointValueError,
  descriptorOf,
  fromDevice,
  scaled,
  toDevice,
  unscaled,
  type DataPoint,
  type DataPointShape,
} from '../src';

function point(shape: DataPointShape, code = 'dp'): DataPoint {
  return { code, dpId: 1, name: null, readable: true, writable: true, shape };
}

const temperature = point(
  { type: 'Integer', min: -200, max: 600, step: 5, scale: 1, unit: '℃' },
  'temp_current',
);

describe('scaled integers', () => {
  it('divides by ten to the power of the scale without floating point noise', () => {
    expect(scaled(215, 1)).toBe(21.5);
    expect(scaled(3, 1)).toBe(0.3);
    expect(scaled(12345, 3)).toBe(12.345);
    expect(scaled(7, 0)).toBe(7);
  });

  it('round trips every scaled integer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 4 }),
        (raw, scale) => {
          expect(unscaled(scaled(raw, scale), scale)).toBe(raw);
        },
      ),
    );
  });

  it('rounds to the nearest device integer', () => {
    expect(unscaled(21.54, 1)).toBe(215);
    expect(unscaled(21.56, 1)).toBe(216);
  });
});

describe('value descriptors from data points', () => {
  it('describes every shape exactly', () => {
    expect(descriptorOf({ type: 'Boolean' })).toStrictEqual({ kind: 'boolean' });
    expect(descriptorOf(temperature.shape)).toStrictEqual({
      kind: 'number',
      min: -20,
      max: 60,
      step: 0.5,
      unit: '℃',
    });
    expect(
      descriptorOf({ type: 'Integer', min: 0, max: 100, step: 1, scale: 0, unit: null }),
    ).toStrictEqual({
      kind: 'number',
      min: 0,
      max: 100,
      step: 1,
    });
    expect(descriptorOf({ type: 'Enum', range: ['a', 'b'] })).toStrictEqual({
      kind: 'enum',
      options: ['a', 'b'],
    });
    expect(descriptorOf({ type: 'String', maxLength: 20 })).toStrictEqual({
      kind: 'text',
      maxLength: 20,
    });
    expect(descriptorOf({ type: 'Raw', maxLength: 12 })).toStrictEqual({
      kind: 'text',
      maxLength: 16,
    });
    expect(descriptorOf({ type: 'Raw', maxLength: 13 })).toStrictEqual({
      kind: 'text',
      maxLength: 20,
    });
    expect(descriptorOf({ type: 'Json', definition: '{}' })).toStrictEqual({
      kind: 'text',
      maxLength: 4096,
    });
    expect(descriptorOf({ type: 'Bitmap', labels: [], bits: 3 })).toStrictEqual({
      kind: 'number',
      min: 0,
      max: 7,
      step: 1,
    });
  });
});

describe('values reported by a device', () => {
  it('scales integers and passes other values through', () => {
    expect(fromDevice(temperature, 215)).toBe(21.5);
    expect(fromDevice(point({ type: 'Boolean' }), false)).toBe(false);
    expect(fromDevice(point({ type: 'Bitmap', labels: [], bits: 3 }), 5)).toBe(5);
    expect(fromDevice(point({ type: 'Enum', range: ['a'] }), 'a')).toBe('a');
    expect(fromDevice(point({ type: 'String', maxLength: 5 }), 'hi')).toBe('hi');
    expect(fromDevice(point({ type: 'Raw', maxLength: 5 }), 'AAE=')).toBe('AAE=');
    expect(fromDevice(point({ type: 'Json', definition: '{}' }), '{"a":1}')).toBe('{"a":1}');
  });

  it('writes a JSON object reported for a JSON data point as text', () => {
    expect(fromDevice(point({ type: 'Json', definition: '{}' }), { h: 1 })).toBe('{"h":1}');
  });

  it('refuses a value of the wrong type, naming the data point', () => {
    expect(() => fromDevice(temperature, '21')).toThrow(
      new DataPointValueError('temp_current', 'a number', '21'),
    );
    expect(() => fromDevice(temperature, Number.NaN)).toThrow(DataPointValueError);
    expect(() => fromDevice(point({ type: 'Boolean' }, 'switch'), 1)).toThrow(
      'Tuya data point switch expected true or false but received 1.',
    );
    expect(() => fromDevice(point({ type: 'String', maxLength: 5 }), { a: 1 })).toThrow(
      'Tuya data point dp expected text but received {"a":1}.',
    );
    expect(() => fromDevice(point({ type: 'Json', definition: '{}' }), null)).toThrow(
      'Tuya data point dp expected text but received null.',
    );
    expect(() => fromDevice(point({ type: 'Json', definition: '{}' }), 4)).toThrow(
      DataPointValueError,
    );
  });

  it('describes the error fully', () => {
    const error = new DataPointValueError('mode', 'text', 3);
    expect(error).toMatchObject({
      name: 'DataPointValueError',
      code: 'mode',
      expected: 'text',
      received: 3,
    });
  });
});

describe('values written to a device', () => {
  it('unscales numbers and checks them against the exact range', () => {
    expect(toDevice(temperature, 21.5)).toBe(215);
    expect(() => toDevice(temperature, 21.3)).toThrow(InvalidValueError);
    expect(() => toDevice(temperature, 61)).toThrow(InvalidValueError);
  });

  it('passes checked booleans, options and text through', () => {
    expect(toDevice(point({ type: 'Boolean' }), true)).toBe(true);
    expect(toDevice(point({ type: 'Enum', range: ['a', 'b'] }), 'b')).toBe('b');
    expect(toDevice(point({ type: 'String', maxLength: 3 }), 'abc')).toBe('abc');
    expect(toDevice(point({ type: 'Bitmap', labels: [], bits: 2 }), 3)).toBe(3);
    expect(() => toDevice(point({ type: 'Enum', range: ['a'] }), 'c')).toThrow(InvalidValueError);
  });
});
