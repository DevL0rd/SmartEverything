import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  InvalidValueError,
  JSON_VALUE,
  NUMBER_VALUE,
  VALUE_DESCRIPTOR,
  checkValue,
  type ValueDescriptor,
} from '../src';

const range: ValueDescriptor = { kind: 'number', min: 10, max: 30, step: 0.5, unit: '°C' };

function refusal(descriptor: ValueDescriptor, value: unknown): InvalidValueError {
  try {
    checkValue(descriptor, value);
  } catch (error) {
    if (error instanceof InvalidValueError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the value to be refused');
}

describe('value descriptors', () => {
  it('refuses a number range whose minimum exceeds its maximum', () => {
    const refused = NUMBER_VALUE.safeParse({ kind: 'number', min: 2, max: 1, step: 1 });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe('min must not exceed max');
    expect(NUMBER_VALUE.safeParse({ kind: 'number', min: 1, max: 1, step: 1 }).success).toBe(true);
  });

  it('refuses a step that is not positive', () => {
    expect(NUMBER_VALUE.safeParse({ kind: 'number', min: 0, max: 1, step: 0 }).success).toBe(false);
  });

  it('parses every kind', () => {
    for (const descriptor of [
      { kind: 'boolean' },
      { kind: 'enum', options: ['a'] },
      { kind: 'color' },
      { kind: 'text', maxLength: 3 },
      { kind: 'action' },
      { kind: 'action', arguments: ['x'] },
    ]) {
      expect(VALUE_DESCRIPTOR.parse(descriptor)).toStrictEqual(descriptor);
    }
  });

  it('refuses an enum without options and options that are empty', () => {
    expect(VALUE_DESCRIPTOR.safeParse({ kind: 'enum', options: [] }).success).toBe(false);
    expect(VALUE_DESCRIPTOR.safeParse({ kind: 'enum', options: [''] }).success).toBe(false);
    expect(VALUE_DESCRIPTOR.safeParse({ kind: 'action', arguments: [''] }).success).toBe(false);
    expect(VALUE_DESCRIPTOR.safeParse({ kind: 'text', maxLength: 0 }).success).toBe(false);
    expect(VALUE_DESCRIPTOR.safeParse({ kind: 'text', maxLength: 1.5 }).success).toBe(false);
  });
});

describe('JSON values', () => {
  it('accepts nested JSON', () => {
    expect(JSON_VALUE.parse({ a: [1, 'b', null, true, { c: [] }] })).toStrictEqual({
      a: [1, 'b', null, true, { c: [] }],
    });
  });

  it('refuses what JSON cannot hold', () => {
    expect(JSON_VALUE.safeParse(undefined).success).toBe(false);
    expect(JSON_VALUE.safeParse({ a: () => 1 }).success).toBe(false);
  });
});

describe('checkValue', () => {
  it('accepts true and false for a boolean and refuses anything else', () => {
    expect(checkValue({ kind: 'boolean' }, true)).toBe(true);
    expect(checkValue({ kind: 'boolean' }, false)).toBe(false);
    expect(refusal({ kind: 'boolean' }, 1).reason).toBe('not true or false');
  });

  it('accepts every number on the step inside the range', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), (steps) => {
        const value = 10 + steps * 0.5;
        expect(checkValue(range, value)).toBe(value);
      }),
    );
  });

  it('accepts both ends of the range', () => {
    expect(checkValue(range, 10)).toBe(10);
    expect(checkValue(range, 30)).toBe(30);
  });

  it('refuses numbers outside the range, off the step, or not finite', () => {
    expect(refusal(range, 9.5).reason).toBe('outside 10 to 30');
    expect(refusal(range, 30.5).reason).toBe('outside 10 to 30');
    expect(refusal(range, 10.25).reason).toBe('not a multiple of 0.5');
    expect(refusal(range, Number.NaN).reason).toBe('not a finite number');
    expect(refusal(range, Number.POSITIVE_INFINITY).reason).toBe('not a finite number');
    expect(refusal(range, '12').reason).toBe('not a finite number');
  });

  it('measures the step from the minimum', () => {
    const thirds: ValueDescriptor = { kind: 'number', min: 1, max: 10, step: 3 };
    expect(checkValue(thirds, 4)).toBe(4);
    expect(checkValue(thirds, 10)).toBe(10);
    expect(refusal(thirds, 3).reason).toBe('not a multiple of 3');
  });

  it('tolerates floating point drift', () => {
    const tenths: ValueDescriptor = { kind: 'number', min: 0.1, max: 1, step: 0.1 };
    expect(checkValue(tenths, 0.30000000000000004)).toBe(0.30000000000000004);
    expect(refusal(tenths, 0.35).reason).toBe('not a multiple of 0.1');
    expect(refusal(tenths, 0.3000001).reason).toBe('not a multiple of 0.1');
  });

  it('accepts only listed options', () => {
    const modes: ValueDescriptor = { kind: 'enum', options: ['auto', 'sleep'] };
    expect(checkValue(modes, 'sleep')).toBe('sleep');
    expect(refusal(modes, 'turbo').reason).toBe('not one of auto, sleep');
    expect(refusal(modes, 1).reason).toBe('not one of auto, sleep');
  });

  it('accepts a colour as hue, saturation and value', () => {
    const colour = { hue: 360, saturation: 0, value: 100 };
    expect(checkValue({ kind: 'color' }, colour)).toStrictEqual(colour);
    const middle = { hue: 120, saturation: 55, value: 40 };
    expect(checkValue({ kind: 'color' }, middle)).toStrictEqual(middle);
    for (const outside of [
      { hue: -1, saturation: 0, value: 0 },
      { hue: 0, saturation: 101, value: 0 },
      { hue: 0, saturation: -1, value: 0 },
      { hue: 0, saturation: 0, value: 101 },
      { hue: 0, saturation: 0, value: -1 },
    ]) {
      expect(refusal({ kind: 'color' }, outside).reason).toBe('not a hue, saturation and value');
    }
    expect(refusal({ kind: 'color' }, { hue: 361, saturation: 0, value: 0 }).reason).toBe(
      'not a hue, saturation and value',
    );
  });

  it('accepts text up to its length', () => {
    const text: ValueDescriptor = { kind: 'text', maxLength: 3 };
    expect(checkValue(text, 'abc')).toBe('abc');
    expect(refusal(text, 'abcd').reason).toBe('not text of at most 3 characters');
    expect(refusal(text, 3).reason).toBe('not text of at most 3 characters');
  });

  it('runs an action without arguments only with null', () => {
    expect(checkValue({ kind: 'action' }, null)).toBeNull();
    expect(refusal({ kind: 'action' }, {}).reason).toBe('this action takes no arguments');
  });

  it('runs an action with its declared arguments only', () => {
    const move: ValueDescriptor = { kind: 'action', arguments: ['direction', 'speed'] };
    expect(checkValue(move, { direction: 'left' })).toStrictEqual({ direction: 'left' });
    expect(refusal(move, { direction: 'left', angle: 3, tilt: 1 }).reason).toBe(
      'unknown arguments angle, tilt',
    );
    expect(refusal(move, 'left').reason).toBe('arguments must be an object');
  });

  it('describes the refusal for a person', () => {
    const error = refusal({ kind: 'boolean' }, 'yes');
    expect(error.name).toBe('InvalidValueError');
    expect(error.descriptor).toStrictEqual({ kind: 'boolean' });
    expect(error.received).toBe('yes');
    expect(error.message).toBe('Expected a boolean value: not true or false. Received "yes".');
  });
});
