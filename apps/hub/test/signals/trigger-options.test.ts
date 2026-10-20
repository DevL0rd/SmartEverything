import fc from 'fast-check';
import { SIGNAL_MATCHER, type SignalInput, type SignalMatcher } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SignalWatchers, type WatchedAutomation } from '../../src/signals/signal-watchers';
import { FakeClock } from '../support/fake-clock';
import { MemoryWatchState } from '../support/watch-state';

const START = '2026-10-08T10:00:00.000Z';
const SENSOR = '1d000000-0000-4000-8000-000000000001';

interface Trigger {
  readonly id: string;
  readonly matcher: SignalMatcher;
}

const TRIGGER_ID = '2d000000-0000-4000-8000-000000000002';

function trigger(extra: Record<string, unknown>): Trigger {
  return {
    id: TRIGGER_ID,
    matcher: SIGNAL_MATCHER.parse({
      source: 'device',
      kind: 'state',
      subject: SENSOR,
      field: 'temperature',
      ...extra,
    }),
  };
}

function reading(value: number, at: string, kind = 'state'): SignalInput {
  return {
    source: 'device',
    kind,
    subject: SENSOR,
    field: 'temperature',
    value,
    previous: null,
    at,
    profileId: null,
    data: {},
  };
}

interface Rig {
  readonly clock: FakeClock;
  readonly state: MemoryWatchState;
  readonly fired: SignalInput[];
  readonly boot: () => SignalWatchers;
}

function rigOf(
  triggers: readonly Trigger[],
  options: { readonly timeZone?: string; readonly pulse?: boolean; readonly start?: string } = {},
): Rig {
  const clock = new FakeClock(options.start ?? START);
  const state = new MemoryWatchState();
  const fired: SignalInput[] = [];
  return {
    clock,
    state,
    fired,
    boot: (): SignalWatchers => {
      const watchers = new SignalWatchers({
        clock,
        timeZone: (): string => options.timeZone ?? 'UTC',
        state,
        fire: (_automationId, signal): void => {
          fired.push(signal);
        },
      });
      watchers.load([
        {
          automationId: 'a',
          triggers: triggers.map((entry) => ({
            triggerId: entry.id,
            matcher: entry.matcher,
            pulse: options.pulse ?? false,
          })),
        },
      ]);
      return watchers;
    },
  };
}

function seconds(count: number): string {
  return new Date(Date.parse(START) + count * 1000).toISOString();
}

function send(rig: Rig, watchers: SignalWatchers, value: number, iso: string): void {
  rig.clock.advanceTo(iso);
  watchers.observe(reading(value, iso));
}

describe('silentSeconds', () => {
  const silent = trigger({ silentSeconds: 60, kind: 'state' });

  it('fires when nothing arrived since the automation was enabled', () => {
    const rig = rigOf([silent]);
    rig.boot();
    rig.clock.advanceTo(seconds(59));
    expect(rig.fired).toHaveLength(0);
    rig.clock.advanceTo(seconds(61));
    expect(rig.fired).toHaveLength(1);
    expect(rig.fired[0]).toMatchObject({ source: 'device', kind: 'state', value: null });
    expect(rig.fired[0]?.subject).toBe(SENSOR);
  });

  it('replacing one automation leaves the running watches of the others untouched', () => {
    const clock = new FakeClock(START);
    const firedBy: string[] = [];
    const watchers = new SignalWatchers({
      clock,
      timeZone: (): string => 'UTC',
      state: new MemoryWatchState(),
      fire: (automationId): void => {
        firedBy.push(automationId);
      },
    });
    const watched = (automationId: string): WatchedAutomation => ({
      automationId,
      triggers: [{ triggerId: 't', matcher: silent.matcher, pulse: false }],
    });
    watchers.load([watched('a'), watched('b')]);
    clock.advanceTo(seconds(30));
    watchers.observe(reading(20, seconds(30)));
    watchers.replace('a', watched('a'));
    clock.advanceTo(seconds(61));
    expect(firedBy).not.toContain('b');
    clock.advanceTo(seconds(91));
    expect(firedBy).toContain('b');
    watchers.replace('b', null);
    watchers.stop();
  });

  it('is renewed by every matching signal and ignores the others', () => {
    const rig = rigOf([silent]);
    const watchers = rig.boot();
    send(rig, watchers, 20, seconds(50));
    rig.clock.advanceTo(seconds(100));
    expect(rig.fired).toHaveLength(0);
    watchers.observe({ ...reading(1, seconds(100), 'other'), kind: 'other' });
    rig.clock.advanceTo(seconds(111));
    expect(rig.fired).toHaveLength(1);
  });

  it('fires once per silence and again after the next signal and a new silence', () => {
    const rig = rigOf([silent]);
    const watchers = rig.boot();
    rig.clock.advanceTo(seconds(300));
    expect(rig.fired).toHaveLength(1);
    send(rig, watchers, 20, seconds(400));
    rig.clock.advanceTo(seconds(459));
    expect(rig.fired).toHaveLength(1);
    rig.clock.advanceTo(seconds(461));
    expect(rig.fired).toHaveLength(2);
  });

  it('keeps counting across a restart instead of starting again', () => {
    const rig = rigOf([silent]);
    const first = rig.boot();
    send(rig, first, 20, seconds(10));
    first.stop();
    rig.clock.advanceTo(seconds(40));
    rig.boot();
    rig.clock.advanceTo(seconds(69));
    expect(rig.fired).toHaveLength(0);
    rig.clock.advanceTo(seconds(71));
    expect(rig.fired).toHaveLength(1);
  });

  it('fires after a restart when the silence ended while the hub was down, and only once', () => {
    const rig = rigOf([silent]);
    const first = rig.boot();
    send(rig, first, 20, seconds(10));
    first.stop();
    rig.clock.advanceTo(seconds(500));
    const second = rig.boot();
    rig.clock.advanceTo(seconds(501));
    expect(rig.fired).toHaveLength(1);
    second.stop();
    rig.boot();
    rig.clock.advanceTo(seconds(900));
    expect(rig.fired).toHaveLength(1);
  });

  it('writes the last-seen time at most once a minute and flushes it on stop', () => {
    const rig = rigOf([silent]);
    const watchers = rig.boot();
    for (let second = 1; second <= 55; second += 1) send(rig, watchers, second, seconds(second));
    expect(rig.state.saves).toBeLessThanOrEqual(2);
    watchers.stop();
    const stored = [...rig.state.rows.values()][0];
    expect(stored?.lastSeenMs).toBe(Date.parse(seconds(55)));
  });

  it('forgets the state of triggers that are no longer loaded, so enabling again starts fresh', () => {
    const rig = rigOf([silent]);
    const first = rig.boot();
    send(rig, first, 20, seconds(10));
    first.stop();
    new SignalWatchers({
      clock: rig.clock,
      timeZone: (): string => 'UTC',
      state: rig.state,
      fire: (): void => undefined,
    }).load([]);
    expect(rig.state.rows.size).toBe(0);
    rig.clock.advanceTo(seconds(1000));
    rig.boot();
    rig.clock.advanceTo(seconds(1059));
    expect(rig.fired).toHaveLength(0);
    rig.clock.advanceTo(seconds(1061));
    expect(rig.fired).toHaveLength(1);
  });

  it('fires exactly for the gaps of at least the silence over random streams', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 0, maxLength: 25 }),
        fc.integer({ min: 1, max: 400 }),
        (gaps, tail) => {
          const rig = rigOf([silent]);
          const watchers = rig.boot();
          let at = 0;
          let expected = 0;
          for (const gap of gaps) {
            if (gap >= 60) expected += 1;
            at += gap;
            send(rig, watchers, 1, seconds(at));
          }
          rig.clock.advanceTo(seconds(at + tail));
          if (tail >= 60) expected += 1;
          expect(rig.fired).toHaveLength(expected);
        },
      ),
    );
  });
});

describe('first', () => {
  const doorbell = (period: string): Trigger =>
    trigger({ kind: 'doorbell', field: undefined, first: period });

  function ring(rig: Rig, watchers: SignalWatchers, iso: string): void {
    rig.clock.advanceTo(iso);
    watchers.observe({ ...reading(1, iso, 'doorbell'), field: null });
  }

  it('fires only the first match of each home day', () => {
    const rig = rigOf([doorbell('day')], { pulse: true });
    const watchers = rig.boot();
    ring(rig, watchers, '2026-10-08T10:00:00.000Z');
    ring(rig, watchers, '2026-10-08T11:00:00.000Z');
    ring(rig, watchers, '2026-10-08T23:59:00.000Z');
    expect(rig.fired).toHaveLength(1);
    ring(rig, watchers, '2026-10-09T00:01:00.000Z');
    ring(rig, watchers, '2026-10-09T09:00:00.000Z');
    expect(rig.fired).toHaveLength(2);
  });

  it('fires only the first match of each week, starting Monday', () => {
    const rig = rigOf([doorbell('week')], { pulse: true });
    const watchers = rig.boot();
    ring(rig, watchers, '2026-10-12T10:00:00.000Z');
    ring(rig, watchers, '2026-10-18T22:00:00.000Z');
    expect(rig.fired).toHaveLength(1);
    ring(rig, watchers, '2026-10-19T00:30:00.000Z');
    ring(rig, watchers, '2026-10-20T00:30:00.000Z');
    expect(rig.fired).toHaveLength(2);
  });

  it('fires once ever, even across restarts and years', () => {
    const rig = rigOf([doorbell('ever')], { pulse: true });
    const first = rig.boot();
    ring(rig, first, '2026-10-08T10:00:00.000Z');
    first.stop();
    const second = rig.boot();
    ring(rig, second, '2027-10-08T10:00:00.000Z');
    expect(rig.fired).toHaveLength(1);
  });

  it('does not fire again for the same day after a restart', () => {
    const rig = rigOf([doorbell('day')], { pulse: true });
    const first = rig.boot();
    ring(rig, first, '2026-10-08T10:00:00.000Z');
    first.stop();
    const second = rig.boot();
    ring(rig, second, '2026-10-08T12:00:00.000Z');
    ring(rig, second, '2026-10-09T12:00:00.000Z');
    expect(rig.fired).toHaveLength(2);
  });

  it('uses the home day across the daylight-saving change', () => {
    const rig = rigOf([doorbell('day')], {
      pulse: true,
      timeZone: 'Europe/Stockholm',
      start: '2026-03-28T22:00:00.000Z',
    });
    const watchers = rig.boot();
    ring(rig, watchers, '2026-03-28T23:30:00.000Z');
    ring(rig, watchers, '2026-03-29T20:30:00.000Z');
    expect(rig.fired).toHaveLength(1);
    ring(rig, watchers, '2026-03-29T22:30:00.000Z');
    expect(rig.fired).toHaveLength(2);
  });

  it('is not used up by a match the cooldown held back', () => {
    const cooled = trigger({
      kind: 'doorbell',
      field: undefined,
      first: 'day',
      cooldownSeconds: 600,
    });
    const rig = rigOf([cooled], { pulse: true });
    const watchers = rig.boot();
    ring(rig, watchers, '2026-10-08T10:00:00.000Z');
    ring(rig, watchers, '2026-10-08T10:01:00.000Z');
    expect(rig.fired).toHaveLength(1);
  });

  it('fires once per home day over random event times', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10 * 24 * 60 - 1 }), { maxLength: 40 }),
        (minutes) => {
          const rig = rigOf([doorbell('day')], { pulse: true });
          const watchers = rig.boot();
          const sorted = [...minutes].sort((left, right) => left - right);
          for (const minute of sorted) {
            ring(rig, watchers, new Date(Date.parse(START) + minute * 60_000).toISOString());
          }
          const days = new Set(
            sorted.map((minute) =>
              new Date(Date.parse(START) + minute * 60_000).toISOString().slice(0, 10),
            ),
          );
          expect(rig.fired).toHaveLength(days.size);
        },
      ),
    );
  });
});

describe('rearm', () => {
  const hot = trigger({ test: { is: 'gt', to: 28 }, rearm: 26 });

  function run(values: readonly number[], watched = hot): { rig: Rig; fires: number[] } {
    const rig = rigOf([watched]);
    const watchers = rig.boot();
    const fires: number[] = [];
    values.forEach((value, index) => {
      const before = rig.fired.length;
      send(rig, watchers, value, seconds(index + 1));
      if (rig.fired.length > before) fires.push(index);
    });
    return { rig, fires };
  }

  it('fires again only after the value went below the rearm number', () => {
    expect(run([20, 29, 27, 29, 25, 29]).fires).toEqual([1, 5]);
  });

  it('without rearm fires on every new crossing', () => {
    expect(run([20, 29, 27, 29, 25, 29], trigger({ test: { is: 'gt', to: 28 } })).fires).toEqual([
      1, 3, 5,
    ]);
  });

  it('works downwards for lt', () => {
    const cold = trigger({ test: { is: 'lt', to: 10 }, rearm: 12 });
    expect(run([20, 9, 11, 9, 13, 9], cold).fires).toEqual([1, 5]);
  });

  it('stays latched across a restart', () => {
    const rig = rigOf([hot]);
    const first = rig.boot();
    send(rig, first, 29, seconds(1));
    first.stop();
    const second = rig.boot();
    send(rig, second, 30, seconds(2));
    expect(rig.fired).toHaveLength(1);
    send(rig, second, 20, seconds(3));
    send(rig, second, 30, seconds(4));
    expect(rig.fired).toHaveLength(2);
  });

  it('follows the model of a latch over random readings', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 15, max: 40 }), { maxLength: 60 }), (values) => {
        let latched = false;
        let expected = 0;
        for (const value of values) {
          if (value > 28 && !latched) {
            expected += 1;
            latched = true;
          } else if (value < 26) {
            latched = false;
          }
        }
        expect(run(values).rig.fired).toHaveLength(expected);
      }),
    );
  });
});
