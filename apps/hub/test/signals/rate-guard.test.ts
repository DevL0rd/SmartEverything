import type { SignalInput, SignalRateLine } from '@smarteverything/domain';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GLOBAL_SIGNALS_PER_SECOND,
  OCCURRENCE_WINDOW_MS,
  RateGuard,
  STORM_ANNOUNCE_INTERVAL_MS,
  STORM_LOG_INTERVAL_MS,
} from '../../src/signals/rate-guard';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const START = Date.parse('2026-10-18T10:00:00.000Z');
const PULSE = { pulse: true } as const;
const URGENT = { pulse: true, urgent: true } as const;
const STATE = { pulse: false } as const;

const RATES: readonly SignalRateLine[] = [
  { source: 'device', perMinute: 6, burst: 3, per: ['kind', 'subject', 'field'] },
  { source: 'event', perMinute: 60, burst: 10, per: ['kind', 'subject'] },
  { source: 'event', kind: 'doorbell', perMinute: 6, burst: 2, per: ['subject'] },
];

type GuardResult = ReturnType<RateGuard['admit']>;

let logs: CapturedLogs;
let now: number;
let guard: RateGuard;

beforeEach(() => {
  logs = captureLogs();
  now = START;
  guard = new RateGuard({ now: (): number => now, log: testLogger('signals'), rates: RATES });
});

function signal(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    source: 'event',
    kind: 'motion',
    subject: 'camera-1',
    field: null,
    value: true,
    previous: null,
    at: new Date(now).toISOString(),
    profileId: null,
    data: {},
    ...overrides,
  };
}

function stormLines(): number {
  return logs.events().filter((event) => event === 'signals.storm').length;
}

describe('token bucket', () => {
  it('lets a burst through, drops the excess and refills with time', () => {
    const verdicts = Array.from({ length: 4 }, () =>
      guard.admit(signal({ source: 'device', kind: 'state', field: 'on' }), STATE),
    );
    expect(verdicts).toStrictEqual(['pass', 'pass', 'pass', 'cap']);
    now += 10_000;
    expect(guard.admit(signal({ source: 'device', kind: 'state', field: 'on' }), STATE)).toBe(
      'pass',
    );
    expect(guard.admit(signal({ source: 'device', kind: 'state', field: 'on' }), STATE)).toBe(
      'cap',
    );
  });

  it('keeps separate buckets per subject and field', () => {
    const make = (subject: string, field: string): SignalInput =>
      signal({ source: 'device', kind: 'state', subject, field });
    for (let index = 0; index < 3; index += 1) guard.admit(make('lamp', 'on'), STATE);
    expect(guard.admit(make('lamp', 'on'), STATE)).toBe('cap');
    expect(guard.admit(make('lamp', 'brightness'), STATE)).toBe('pass');
    expect(guard.admit(make('fan', 'on'), STATE)).toBe('pass');
  });

  it('uses the line of the kind when one exists', () => {
    const ring = (): GuardResult => guard.admit(signal({ kind: 'doorbell' }), URGENT);
    expect([ring(), ring(), ring()]).toStrictEqual(['pass', 'pass', 'cap']);
  });

  it('says when the next token is back, and the signal passes then', () => {
    const lamp = (): SignalInput => signal({ source: 'device', kind: 'state', field: 'on' });
    for (let index = 0; index < 3; index += 1) guard.admit(lamp(), STATE);
    expect(guard.admit(lamp(), STATE)).toBe('cap');
    const back = guard.refillAt(lamp());
    expect(back).toBe(START + 10_000);
    now = back - 1;
    expect(guard.admit(lamp(), STATE)).toBe('cap');
    now = guard.refillAt(lamp());
    expect(guard.admit(lamp(), STATE)).toBe('pass');
  });

  it('starts a clock that was set backwards with a full bucket instead of draining it', () => {
    const lamp = (): SignalInput => signal({ source: 'device', kind: 'state', field: 'on' });
    now = START + 3_600_000;
    for (let index = 0; index < 3; index += 1) guard.admit(lamp(), STATE);
    expect(guard.admit(lamp(), STATE)).toBe('cap');
    now = START;
    expect([lamp(), lamp(), lamp()].map((item) => guard.admit(item, STATE))).toStrictEqual([
      'pass',
      'pass',
      'pass',
    ]);
  });

  it('refuses a signal whose source has no cap, naming it', () => {
    expect(guard.admit(signal({ source: 'mystery' }), PULSE)).toBe('uncapped');
    expect(logs.events()).toContain('signals.uncapped');
  });

  it('never passes more than burst plus the refill, for any stream of arrivals', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 3000 }), fc.constantFrom('a', 'b', 'c')), {
          minLength: 1,
          maxLength: 200,
        }),
        (arrivals) => {
          const local = new RateGuard({
            now: (): number => now,
            log: testLogger('signals'),
            rates: RATES,
          });
          now = START;
          const passed = new Map<string, number>();
          for (const [gap, subject] of arrivals) {
            now += gap;
            const verdict = local.admit(
              signal({ source: 'device', kind: 'state', subject, field: 'x' }),
              STATE,
            );
            if (verdict === 'pass') passed.set(subject, (passed.get(subject) ?? 0) + 1);
          }
          const elapsedMinutes = (now - START) / 60_000;
          for (const count of passed.values()) {
            expect(count).toBeLessThanOrEqual(3 + Math.ceil(6 * elapsedMinutes));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('storm logging', () => {
  it('logs one storm line per key per minute with the dropped count', () => {
    for (let index = 0; index < 50; index += 1) {
      guard.admit(signal({ source: 'device', kind: 'state', field: 'on' }), STATE);
    }
    expect(stormLines()).toBe(1);
    now += STORM_LOG_INTERVAL_MS;
    for (let index = 0; index < 50; index += 1) {
      guard.admit(signal({ source: 'device', kind: 'state', field: 'on' }), STATE);
    }
    const counts = logs.records
      .filter((record) => record.event === 'signals.storm')
      .map((record) => record.payload['dropped']);
    expect(counts).toStrictEqual([1, 46]);
  });

  it('flushes the pending count when traffic of any kind arrives a minute later', () => {
    for (let index = 0; index < 10; index += 1) {
      guard.admit(signal({ source: 'device', kind: 'state', field: 'on' }), STATE);
    }
    now += STORM_LOG_INTERVAL_MS;
    guard.admit(signal({ subject: 'other' }), PULSE);
    const counts = logs.records
      .filter((record) => record.event === 'signals.storm')
      .map((record) => record.payload['dropped']);
    expect(counts).toStrictEqual([1, 6]);
  });

  it('says when an announcement is due once per source per ten minutes', () => {
    expect(guard.announceDue('device')).toBe(true);
    expect(guard.announceDue('device')).toBe(false);
    expect(guard.announceDue('event')).toBe(true);
    now += STORM_ANNOUNCE_INTERVAL_MS;
    expect(guard.announceDue('device')).toBe(true);
  });
});

describe('global storm guard', () => {
  function flood(count: number, urgent = false): GuardResult[] {
    return Array.from({ length: count }, (_, index) =>
      guard.admit(signal({ subject: `camera-${String(index)}` }), urgent ? URGENT : PULSE),
    );
  }

  it('drops non-urgent pulses beyond the per-second limit and logs once', () => {
    const verdicts = flood(GLOBAL_SIGNALS_PER_SECOND + 100);
    expect(verdicts.filter((verdict) => verdict === 'global')).toHaveLength(100);
    expect(logs.events().filter((event) => event === 'signals.storm_global')).toHaveLength(1);
  });

  it('never drops an urgent kind and counts the next second afresh', () => {
    flood(GLOBAL_SIGNALS_PER_SECOND);
    expect(flood(50, true).every((verdict) => verdict === 'pass')).toBe(true);
    now += 1000;
    expect(flood(1)).toStrictEqual(['pass']);
  });

  it('lets state changes through a global storm so a value is never lost to a pulse flood', () => {
    flood(GLOBAL_SIGNALS_PER_SECOND + 10);
    expect(guard.admit(signal({ source: 'device', kind: 'state', field: 'on' }), STATE)).toBe(
      'pass',
    );
  });

  it('handles ten thousand signals in one second in under fifty milliseconds with one line', () => {
    const batch = Array.from({ length: 10_000 }, (_, index) =>
      signal({ subject: `camera-${String(index)}` }),
    );
    const started = performance.now();
    for (const item of batch) guard.admit(item, PULSE);
    expect(performance.now() - started).toBeLessThan(50);
    expect(logs.events().filter((event) => event === 'signals.storm_global')).toHaveLength(1);
    expect(stormLines()).toBe(0);
  });
});

describe('occurrence dedupe', () => {
  const occurrence = (key: string): SignalInput => signal({ data: { occurrence: key } });

  it('drops the same pulse occurrence for a minute and allows it again after', () => {
    expect(guard.admit(occurrence('a'), PULSE)).toBe('pass');
    expect(guard.admit(occurrence('a'), PULSE)).toBe('duplicate');
    expect(guard.admit(occurrence('b'), PULSE)).toBe('pass');
    now += OCCURRENCE_WINDOW_MS;
    expect(guard.admit(occurrence('a'), PULSE)).toBe('pass');
  });

  it('does not remember an occurrence that was dropped for its cap', () => {
    for (let index = 0; index < 10; index += 1) guard.admit(signal({ subject: 'busy' }), PULSE);
    const late = signal({ subject: 'busy', data: { occurrence: 'late' } });
    expect(guard.admit(late, PULSE)).toBe('cap');
    now += 60_000;
    expect(guard.admit(late, PULSE)).toBe('pass');
  });

  it('ignores occurrence keys on state signals', () => {
    const state = (): SignalInput =>
      signal({ source: 'device', kind: 'state', field: 'on', data: { occurrence: 'a' } });
    expect([guard.admit(state(), STATE), guard.admit(state(), STATE)]).toStrictEqual([
      'pass',
      'pass',
    ]);
  });
});
