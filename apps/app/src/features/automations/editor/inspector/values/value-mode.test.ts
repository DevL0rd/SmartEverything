import { describe, expect, it } from 'vitest';
import { defaultLiteral, timeOfDayText, timeOfDayParts } from './literal-model';
import { modeOf, modesFor, switchedValue } from './value-mode';

describe('modeOf', () => {
  it('tells a constant from a wire', () => {
    expect(modeOf(undefined)).toBe('value');
    expect(modeOf({ lit: 3 })).toBe('value');
    expect(modeOf({ wire: { from: 'a', port: 'result' } })).toBe('wire');
  });
});

describe('modesFor', () => {
  it('shows only Value on static ports and Value or Wire elsewhere', () => {
    expect(modesFor(true)).toEqual(['value']);
    expect(modesFor(false)).toEqual(['value', 'wire']);
  });
});

describe('switchedValue', () => {
  it('clears a wire for Value and waits for a pick for Wire', () => {
    expect(switchedValue({ wire: { from: 'a', port: 'name' } }, 'value')).toBeNull();
    expect(switchedValue({ lit: 42 }, 'wire')).toBeUndefined();
    expect(switchedValue(undefined, 'wire')).toBeUndefined();
    expect(switchedValue({ lit: 42 }, 'value')).toEqual({ lit: 42 });
  });
});

describe('literal defaults', () => {
  it('starts every control from a value that fits it', () => {
    expect(defaultLiteral({ t: 'switch' })).toBe(false);
    expect(
      defaultLiteral({ t: 'number', integer: true, min: 5, max: 9, step: 1, unit: undefined }),
    ).toBe(5);
    expect(defaultLiteral({ t: 'choice', options: [{ id: 'a', label: 'A' }] })).toBe('a');
    expect(defaultLiteral({ t: 'moment', of: 'timeOfDay' })).toBe('07:00');
  });

  it('round trips the time of day', () => {
    expect(timeOfDayText(timeOfDayParts('06:05').hour, timeOfDayParts('06:05').minute)).toBe(
      '06:05',
    );
  });
});
