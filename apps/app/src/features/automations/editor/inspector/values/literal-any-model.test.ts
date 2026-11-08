import { describe, expect, it } from 'vitest';
import { ANY_KINDS, anyKindOf, anyStart, entryName, refOfKey } from './literal-any-model';

describe('typed editing of open values', () => {
  it('reads the kind of a value so it gets a typed field', () => {
    expect(anyKindOf(undefined)).toBe('text');
    expect(anyKindOf('hi')).toBe('text');
    expect(anyKindOf(3)).toBe('number');
    expect(anyKindOf(true)).toBe('flag');
    expect(anyKindOf([1])).toBe('list');
    expect(anyKindOf({ device: 'd1' })).toBe('place');
    expect(anyKindOf({ room: 'r1', families: ['light'] })).toBe('place');
    expect(anyKindOf({ kind: 'device', deviceId: 'd1' })).toBe('group');
  });

  it('starts every kind with a value of that kind', () => {
    for (const { value } of ANY_KINDS) expect(anyKindOf(anyStart(value))).toBe(value);
  });

  it('finds the thing an id names from its key', () => {
    expect(refOfKey('deviceId')).toBe('device');
    expect(refOfKey('personId')).toBe('person');
    expect(refOfKey('Id')).toBeUndefined();
    expect(refOfKey('text')).toBeUndefined();
  });

  it('names a new value after the ones already there', () => {
    expect(entryName([])).toBe('value1');
    expect(entryName(['value1', 'value2'])).toBe('value3');
  });
});
