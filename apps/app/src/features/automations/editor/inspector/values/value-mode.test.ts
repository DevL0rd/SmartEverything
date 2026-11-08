import { describe, expect, it } from 'vitest';
import type { FieldControl } from '../schema-fields';
import {
  NO_PORT_SCOPE,
  defaultLiteral,
  editorControl,
  sampleControl,
  timeOfDayParts,
  timeOfDayText,
  typedControl,
} from './literal-model';
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

describe('picked, edited and typed values', () => {
  const typedByA = { t: 'typedBy', port: 'a', base: { t: 'json' } } as const;

  it('starts a picker empty and an annotated port from its base', () => {
    expect(defaultLiteral({ t: 'pick', source: 'tools', multiple: false })).toBeNull();
    expect(defaultLiteral({ t: 'pick', source: 'tools', multiple: true })).toEqual([]);
    expect(
      defaultLiteral({ t: 'editor', id: 'week-grid', base: { t: 'list', item: { t: 'json' } } }),
    ).toEqual([]);
    expect(defaultLiteral({ t: 'typedBy', port: 'a', base: { t: 'switch' } })).toBe(false);
  });

  it('opens the duration, colour and time editors and the base for the rest', () => {
    expect(editorControl({ t: 'editor', id: 'duration', base: { t: 'json' } })).toEqual({
      t: 'duration',
    });
    expect(editorControl({ t: 'editor', id: 'colour', base: { t: 'json' } })).toEqual({
      t: 'colour',
    });
    const base: FieldControl = { t: 'entries', item: { t: 'json' } };
    expect(editorControl({ t: 'editor', id: 'key-combo', base })).toBe(base);
  });

  it('reads the type of a value', () => {
    expect(sampleControl(true)).toEqual({ t: 'switch' });
    expect(sampleControl(4)).toMatchObject({ t: 'number', min: undefined, max: undefined });
    expect(sampleControl('x')).toEqual({ t: 'text' });
    expect(sampleControl({ hue: 1, saturation: 2, value: 3 })).toEqual({ t: 'colour' });
    expect(sampleControl([1])).toMatchObject({ t: 'list', item: { t: 'number' } });
    expect(sampleControl(null)).toBeNull();
  });

  it('types a port like the generic port it follows', () => {
    const scope = {
      ports: { a: { lit: 3 } },
      controls: { a: { t: 'json' } },
      target: [],
      wholeHome: false,
    } as const;
    expect(typedControl(typedByA, scope)).toMatchObject({ t: 'field', control: { t: 'number' } });
    const list = { t: 'typedBy', port: 'a', base: { t: 'list', item: { t: 'json' } } } as const;
    expect(typedControl(list, scope)).toMatchObject({
      t: 'field',
      control: { t: 'list', item: { t: 'number' } },
    });
  });

  it('keeps the base when the port it follows is wired or empty, and types by a picked control', () => {
    expect(typedControl(typedByA, NO_PORT_SCOPE)).toEqual({ t: 'field', control: { t: 'json' } });
    const wired = {
      ports: { a: { wire: { from: 'n', port: 'value' } } },
      controls: { a: { t: 'json' } },
      target: [],
      wholeHome: false,
    } as const;
    expect(typedControl(typedByA, wired)).toEqual({ t: 'field', control: { t: 'json' } });
    const named = {
      ports: { a: { lit: 'brightness' } },
      controls: { a: { t: 'pick', source: 'device.controls', multiple: false } },
      target: [],
      wholeHome: false,
    } as const;
    expect(typedControl(typedByA, named)).toEqual({
      t: 'control',
      typing: { source: 'device.controls', scope: 'shown', control: 'brightness' },
    });
  });
});
