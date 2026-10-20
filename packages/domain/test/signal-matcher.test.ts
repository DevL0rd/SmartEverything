import { describe, expect, it } from 'vitest';
import { SIGNAL_MATCHER, type SignalInput } from '../src/index';
import { signalMatches } from '../src/signal-matcher';

const LAMP = '11111111-1111-4111-8111-111111111111';

function signal(change: Partial<SignalInput> = {}): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: LAMP,
    field: 'power',
    value: true,
    previous: false,
    at: '2026-10-18T10:00:00.000Z',
    profileId: null,
    data: { cause: 'physical', roomId: 'kitchen' },
    ...change,
  };
}

describe('SIGNAL_MATCHER', () => {
  it('accepts a source and kind alone', () => {
    expect(SIGNAL_MATCHER.safeParse({ source: 'device', kind: 'state' }).success).toBe(true);
  });

  it('accepts the whole timing block', () => {
    const matcher = {
      source: 'device',
      kind: 'state',
      subject: LAMP,
      field: 'temperature',
      match: { cause: 'physical' },
      test: { is: 'gt', to: 26 },
      window: { of: 'avg', seconds: 300 },
      holdSeconds: 60,
      debounceSeconds: 5,
      cooldownSeconds: 600,
      first: 'day',
      rearm: 24,
    };
    expect(SIGNAL_MATCHER.safeParse(matcher).success).toBe(true);
  });

  it('refuses unknown keys, a bad source name and empty text', () => {
    expect(
      SIGNAL_MATCHER.safeParse({ source: 'device', kind: 'state', on: 'signal' }).success,
    ).toBe(false);
    expect(SIGNAL_MATCHER.safeParse({ source: 'Device', kind: 'state' }).success).toBe(false);
    expect(SIGNAL_MATCHER.safeParse({ source: 'device', kind: ' ' }).success).toBe(false);
  });

  it('keeps the V2 option rules', () => {
    const base = { source: 'device', kind: 'state' };
    expect(SIGNAL_MATCHER.safeParse({ ...base, silentSeconds: 60, holdSeconds: 1 }).success).toBe(
      false,
    );
    expect(
      SIGNAL_MATCHER.safeParse({ ...base, silentSeconds: 60, cooldownSeconds: 5 }).success,
    ).toBe(true);
    expect(SIGNAL_MATCHER.safeParse({ ...base, rearm: 3 }).success).toBe(false);
    expect(SIGNAL_MATCHER.safeParse({ ...base, test: { is: 'gt', to: 5 }, rearm: 9 }).success).toBe(
      false,
    );
    expect(SIGNAL_MATCHER.safeParse({ ...base, test: { is: 'gt', to: 5 }, rearm: 4 }).success).toBe(
      true,
    );
    expect(SIGNAL_MATCHER.safeParse({ ...base, holdSeconds: 86_401 }).success).toBe(false);
  });
});

describe('signalMatches', () => {
  const base = { source: 'device', kind: 'state' };

  it('matches on source and kind', () => {
    expect(signalMatches(base, signal())).toBe(true);
    expect(signalMatches(base, signal({ source: 'event' }))).toBe(false);
    expect(signalMatches(base, signal({ kind: 'online' }))).toBe(false);
  });

  it('narrows by subject and field when given', () => {
    expect(signalMatches({ ...base, subject: LAMP, field: 'power' }, signal())).toBe(true);
    expect(signalMatches({ ...base, subject: 'other' }, signal())).toBe(false);
    expect(signalMatches({ ...base, field: 'level' }, signal())).toBe(false);
    expect(signalMatches({ ...base, subject: LAMP }, signal({ subject: null }))).toBe(false);
  });

  it('needs every match key to equal the signal data', () => {
    expect(signalMatches({ ...base, match: { cause: 'physical' } }, signal())).toBe(true);
    expect(signalMatches({ ...base, match: { cause: 'app' } }, signal())).toBe(false);
    expect(signalMatches({ ...base, match: { missing: 1 } }, signal())).toBe(false);
    expect(signalMatches({ ...base, match: {} }, signal())).toBe(true);
    expect(
      signalMatches({ ...base, match: { list: [1, 2] } }, signal({ data: { list: [1, 2] } })),
    ).toBe(true);
  });
});
