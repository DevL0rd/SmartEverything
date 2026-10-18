import { describe, expect, it } from 'vitest';
import {
  SIGNAL_TRIGGER,
  signalMatches,
  windowValue,
  type SignalInput,
  type WindowSample,
} from '../src';

const SENSOR = '22222222-2222-4222-8222-222222222222';

function signal(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: SENSOR,
    field: 'temperature',
    value: 21,
    previous: null,
    at: '2026-10-08T10:00:00.000Z',
    profileId: null,
    data: {},
    ...overrides,
  };
}

function samples(values: readonly number[], stepMs = 60_000): WindowSample[] {
  return values.map((value, index) => ({ atMs: index * stepMs, value }));
}

describe('C7 signal windows', () => {
  it('averages, takes the minimum and the maximum of the numeric samples', () => {
    const window = samples([10, 20, 60]);
    expect(windowValue('avg', window)).toBe(30);
    expect(windowValue('min', window)).toBe(10);
    expect(windowValue('max', window)).toBe(60);
  });

  it('counts every sample, numeric or not', () => {
    expect(
      windowValue('count', [
        { atMs: 0, value: true },
        { atMs: 1, value: 'x' },
      ]),
    ).toBe(2);
  });

  it('reports the change per minute between the first and last numeric sample', () => {
    expect(windowValue('rate', samples([10, 20, 40]))).toBe(15);
    expect(windowValue('rate', samples([10]))).toBeNull();
  });

  it('has no average, minimum or maximum without numeric samples', () => {
    expect(windowValue('avg', [])).toBeNull();
    expect(windowValue('max', [{ atMs: 0, value: 'on' }])).toBeNull();
  });
});

describe('C7 signal matching', () => {
  const trigger = (extra: Record<string, unknown>): ReturnType<typeof SIGNAL_TRIGGER.parse> =>
    SIGNAL_TRIGGER.parse({ type: 'signal', source: 'device', kind: 'state', ...extra });

  it('matches by source and kind and by subject and field only when they are named', () => {
    expect(signalMatches(trigger({}), signal())).toBe(true);
    expect(signalMatches(trigger({ subject: SENSOR, field: 'temperature' }), signal())).toBe(true);
    expect(signalMatches(trigger({ subject: SENSOR, field: 'humidity' }), signal())).toBe(false);
    expect(signalMatches(trigger({ subject: LAMP_ID }), signal())).toBe(false);
    expect(signalMatches(trigger({}), signal({ source: 'event' }))).toBe(false);
    expect(signalMatches(trigger({}), signal({ kind: 'forecast' }))).toBe(false);
  });

  it('needs every match key to equal the detail of the signal exactly', () => {
    const wanted = trigger({ match: { detection: 'baby_cry', place: 'nursery' } });
    expect(
      signalMatches(wanted, signal({ data: { detection: 'baby_cry', place: 'nursery' } })),
    ).toBe(true);
    expect(signalMatches(wanted, signal({ data: { detection: 'baby_cry' } }))).toBe(false);
    expect(
      signalMatches(wanted, signal({ data: { detection: 'loud_sound', place: 'nursery' } })),
    ).toBe(false);
  });

  it('bounds the timing of a trigger and defaults it to none', () => {
    const parsed = trigger({});
    expect([parsed.debounceSeconds, parsed.holdSeconds, parsed.cooldownSeconds]).toStrictEqual([
      0, 0, 0,
    ]);
    expect(SIGNAL_TRIGGER.safeParse({ ...parsed, holdSeconds: 86_401 }).success).toBe(false);
    expect(
      SIGNAL_TRIGGER.safeParse({ ...parsed, window: { mode: 'avg', seconds: 3601 } }).success,
    ).toBe(false);
  });
});

const LAMP_ID = '11111111-1111-4111-8111-111111111111';
