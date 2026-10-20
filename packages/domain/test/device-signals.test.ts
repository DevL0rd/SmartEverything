import { describe, expect, it } from 'vitest';
import {
  DEVICE_FAMILIES,
  DEVICE_LIFECYCLE_CHANGES,
  DEVICE_SIGNALS,
  DEVICE_STATE_CAUSES,
  SIGNAL_SOURCES,
  UnknownSignalMatchError,
  UnknownSignalMatchValueError,
  kindSpecOf,
  signalRateOf,
  signalRegistered,
  signalTriggerError,
} from '../src';

const KINDS = DEVICE_SIGNALS.kinds;

function matchKeys(kind: string): string[] {
  return (
    kindSpecOf(SIGNAL_SOURCES, { source: 'device', kind })?.match.map((entry) => entry.key) ?? []
  );
}

describe('device signal sources', () => {
  it('offer the facts of the device as match keys on a value change, so one trigger covers every light or a whole room', () => {
    expect(matchKeys('state')).toStrictEqual([
      'family',
      'kind',
      'roomId',
      'provider',
      'name',
      'role',
      'unit',
      'cause',
    ]);
  });

  it('describe going online and offline as a state with words for both, and lifecycle as a moment', () => {
    const online = KINDS.find((kind) => kind.kind === 'online');
    const lifecycle = KINDS.find((kind) => kind.kind === 'lifecycle');
    expect(online).toMatchObject({ pulse: false, states: { on: 'online', off: 'offline' } });
    expect(online?.fields).toStrictEqual([]);
    expect(lifecycle).toMatchObject({ pulse: true, feed: true });
    expect(matchKeys('lifecycle')).toStrictEqual([
      'change',
      'family',
      'kind',
      'roomId',
      'provider',
      'name',
    ]);
  });

  it('give every listed match value a plain-language label', () => {
    const unlabelled = KINDS.flatMap((kind) =>
      kind.match.flatMap((entry) =>
        (entry.values ?? [])
          .filter((value) => entry.valueLabels?.[value] === undefined)
          .map((value) => `${kind.kind}.${entry.key}=${value}`),
      ),
    );
    expect(unlabelled).toStrictEqual([]);
  });

  it('list every family, lifecycle step and cause that the hub can emit', () => {
    const values = (kind: string, key: string): readonly string[] | null | undefined =>
      kindSpecOf(SIGNAL_SOURCES, { source: 'device', kind })?.match.find(
        (entry) => entry.key === key,
      )?.values;
    expect(values('state', 'family')).toStrictEqual(DEVICE_FAMILIES);
    expect(values('state', 'cause')).toStrictEqual(DEVICE_STATE_CAUSES);
    expect(values('lifecycle', 'change')).toStrictEqual(DEVICE_LIFECYCLE_CHANGES);
    expect(values('state', 'role')).toEqual(
      expect.arrayContaining(['power', 'brightness', 'fault']),
    );
  });

  it('accept a trigger on any light and refuse a family, cause or step that does not exist', () => {
    const base = { source: 'device', kind: 'state' };
    expect(signalTriggerError(SIGNAL_SOURCES, { ...base, match: { family: 'light' } })).toBeNull();
    expect(
      signalTriggerError(SIGNAL_SOURCES, { ...base, match: { family: 'toaster' } }),
    ).toBeInstanceOf(UnknownSignalMatchValueError);
    expect(
      signalTriggerError(SIGNAL_SOURCES, { ...base, match: { colour: 'red' } }),
    ).toBeInstanceOf(UnknownSignalMatchError);
    expect(
      signalTriggerError(SIGNAL_SOURCES, {
        source: 'device',
        kind: 'lifecycle',
        match: { change: 'renamed', family: 'light' },
      }),
    ).toBeNull();
    expect(
      signalTriggerError(SIGNAL_SOURCES, {
        source: 'device',
        kind: 'lifecycle',
        match: { change: 'exploded' },
      }),
    ).toBeInstanceOf(UnknownSignalMatchValueError);
  });

  it('register the device state of any capability, but online and lifecycle only without a field', () => {
    expect(
      signalRegistered(SIGNAL_SOURCES, { source: 'device', kind: 'state', field: 'power' }),
    ).toBe(true);
    expect(
      signalRegistered(SIGNAL_SOURCES, { source: 'device', kind: 'online', field: null }),
    ).toBe(true);
    expect(
      signalRegistered(SIGNAL_SOURCES, { source: 'device', kind: 'online', field: 'power' }),
    ).toBe(false);
    expect(
      signalRegistered(SIGNAL_SOURCES, { source: 'device', kind: 'lifecycle', field: null }),
    ).toBe(true);
  });

  it('cap each kind at its own rate per device', () => {
    expect(signalRateOf('device', 'state')).toMatchObject({
      perMinute: 30,
      burst: 10,
      per: ['kind', 'subject', 'field'],
    });
    expect(signalRateOf('device', 'online')).toMatchObject({
      perMinute: 6,
      burst: 3,
      per: ['kind', 'subject'],
    });
    expect(signalRateOf('device', 'lifecycle')).toMatchObject({
      perMinute: 20,
      burst: 10,
      per: ['kind', 'subject'],
    });
  });
});
