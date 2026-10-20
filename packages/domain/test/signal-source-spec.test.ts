import { describe, expect, it } from 'vitest';
import {
  UnknownSignalError,
  UnknownSignalMatchError,
  UnknownSignalMatchValueError,
  compatibleSignalMatch,
  kindSpecOf,
  signalRegistered,
  signalTriggerError,
  type SignalKindSpec,
  type SignalSourceSpec,
} from '../src/signal-sources/spec';

function kind(overrides: Partial<SignalKindSpec> & Pick<SignalKindSpec, 'kind'>): SignalKindSpec {
  return {
    label: overrides.kind,
    subject: 'none',
    fields: [],
    match: [],
    pulse: true,
    ...overrides,
  };
}

const SENSOR = kind({
  kind: 'reading',
  fields: [{ field: 'level', label: 'Level', unit: '%' }],
  match: [
    { key: 'room', label: 'Room', values: null },
    { key: 'side', label: 'Side', values: ['left', 'right'] },
  ],
});
const STATE = kind({ kind: 'state', fields: 'capabilities' });
const PULSE = kind({ kind: 'ping' });
const SOURCES: readonly SignalSourceSpec[] = [
  { source: 'sensor', label: 'Sensor', kinds: [SENSOR, STATE, PULSE] },
];

describe('kindSpecOf', () => {
  it('finds a kind by source and kind', () => {
    expect(kindSpecOf(SOURCES, { source: 'sensor', kind: 'reading' })).toBe(SENSOR);
  });

  it('finds nothing for an unknown source or kind', () => {
    expect(kindSpecOf(SOURCES, { source: 'other', kind: 'reading' })).toBeUndefined();
    expect(kindSpecOf(SOURCES, { source: 'sensor', kind: 'nope' })).toBeUndefined();
  });
});

describe('signalRegistered', () => {
  it('accepts a listed field and refuses another', () => {
    expect(signalRegistered(SOURCES, { source: 'sensor', kind: 'reading', field: 'level' })).toBe(
      true,
    );
    expect(signalRegistered(SOURCES, { source: 'sensor', kind: 'reading', field: 'volume' })).toBe(
      false,
    );
  });

  it('accepts no field only for a kind that lists none', () => {
    expect(signalRegistered(SOURCES, { source: 'sensor', kind: 'ping', field: null })).toBe(true);
    expect(signalRegistered(SOURCES, { source: 'sensor', kind: 'ping', field: 'level' })).toBe(
      false,
    );
    expect(signalRegistered(SOURCES, { source: 'sensor', kind: 'reading', field: null })).toBe(
      false,
    );
  });

  it('accepts a catalogued or raw capability for a kind that reports capabilities', () => {
    expect(
      signalRegistered(SOURCES, { source: 'sensor', kind: 'state', field: 'temperature' }),
    ).toBe(true);
    expect(
      signalRegistered(SOURCES, { source: 'sensor', kind: 'state', field: 'raw:custom' }),
    ).toBe(true);
    expect(signalRegistered(SOURCES, { source: 'sensor', kind: 'state', field: 'bogus' })).toBe(
      false,
    );
    expect(signalRegistered(SOURCES, { source: 'sensor', kind: 'state', field: null })).toBe(false);
  });

  it('refuses a signal whose kind does not exist', () => {
    expect(signalRegistered(SOURCES, { source: 'sensor', kind: 'nope', field: null })).toBe(false);
  });
});

describe('compatibleSignalMatch', () => {
  const SWAPPED = kind({
    kind: 'reading',
    match: [
      { key: 'room', label: 'Room', values: ['kitchen'] },
      { key: 'side', label: 'Side', values: ['left'] },
    ],
  });

  it('keeps keys the old kind did not know', () => {
    expect(compatibleSignalMatch(SENSOR, SWAPPED, { extra: 1 })).toStrictEqual({ extra: 1 });
    expect(compatibleSignalMatch(undefined, undefined, { room: 'x' })).toStrictEqual({ room: 'x' });
  });

  it('keeps a known key only when the new kind accepts its value', () => {
    expect(
      compatibleSignalMatch(SENSOR, SWAPPED, { room: 'kitchen', side: 'right' }),
    ).toStrictEqual({ room: 'kitchen' });
    expect(compatibleSignalMatch(SENSOR, SWAPPED, { room: 'attic' })).toStrictEqual({});
  });

  it('accepts any value when the new key is free text, and drops a key the new kind lacks', () => {
    const free = kind({ kind: 'reading', match: [{ key: 'room', label: 'Room', values: null }] });
    expect(compatibleSignalMatch(SENSOR, free, { room: 'attic', side: 'left' })).toStrictEqual({
      room: 'attic',
    });
    expect(compatibleSignalMatch(SENSOR, undefined, { room: 'attic' })).toStrictEqual({});
  });
});

describe('signalTriggerError', () => {
  it('names an unknown signal', () => {
    const error = signalTriggerError(SOURCES, { source: 'sensor', kind: 'nope', match: {} });
    expect(error).toBeInstanceOf(UnknownSignalError);
    expect(error?.message).toBe('No signal "nope" from "sensor" exists in this home.');
  });

  it('names an unknown match key and lists the known keys', () => {
    const error = signalTriggerError(SOURCES, {
      source: 'sensor',
      kind: 'reading',
      match: { colour: 'red' },
    });
    expect(error).toBeInstanceOf(UnknownSignalMatchError);
    expect(error?.message).toBe(
      'The signal "reading" from "sensor" has no match key "colour"; its keys are room, side.',
    );
  });

  it('says a kind without match keys has none', () => {
    const error = signalTriggerError(SOURCES, {
      source: 'sensor',
      kind: 'ping',
      match: { colour: 'red' },
    });
    expect(error?.message).toContain('it has no match keys');
  });

  it('names a value the key does not take', () => {
    const error = signalTriggerError(SOURCES, {
      source: 'sensor',
      kind: 'reading',
      match: { side: 'up' },
    });
    expect(error).toBeInstanceOf(UnknownSignalMatchValueError);
    expect(error?.message).toBe(
      'The match key "side" of the signal "reading" from "sensor" takes only left, right.',
    );
  });

  it('accepts a trigger whose keys and values are all known', () => {
    expect(
      signalTriggerError(SOURCES, {
        source: 'sensor',
        kind: 'reading',
        match: { room: 'anything', side: 'left' },
      }),
    ).toBeNull();
  });
});
