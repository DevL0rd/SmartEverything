import {
  SIGNAL_MATCHER,
  SIGNAL_SOURCES,
  signalTriggerError,
  type SignalInput,
  type SignalMatcher,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { SignalBus } from '../../src/signals/bus';
import { SignalWatchers } from '../../src/signals/signal-watchers';
import { FakeClock } from '../support/fake-clock';
import { MemoryWatchState } from '../support/watch-state';
import { captureLogs, testLogger } from '../support/logs';

const START = '2026-10-08T10:00:00.000Z';
const DESK = '1d000000-0000-4000-8000-000000000001';

function trigger(extra: Record<string, unknown>): SignalMatcher {
  return SIGNAL_MATCHER.parse({
    source: 'computer',
    kind: 'app_open',
    test: { is: 'eq', to: true },
    holdSeconds: 1800,
    ...extra,
  });
}

function appSignal(appId: string, open: boolean, at: string, kind: string): SignalInput {
  return {
    source: 'computer',
    kind,
    subject: DESK,
    field: appId,
    value: open,
    previous: null,
    at,
    profileId: null,
    data: { app: appId === 'firefox.desktop' ? 'Firefox' : 'Kate', appId },
  };
}

interface Setup {
  readonly clock: FakeClock;
  readonly bus: SignalBus;
  readonly fired: string[];
  readonly open: (appId: string, open: boolean, kind?: string) => void;
}

function setup(triggers: readonly SignalMatcher[]): Setup {
  const clock = new FakeClock(START);
  const bus = new SignalBus({ log: testLogger('signals') });
  const fired: string[] = [];
  const watchers = new SignalWatchers({
    clock,
    timeZone: (): string => 'UTC',
    state: new MemoryWatchState(),
    fire: (automationId, signal): void => {
      fired.push(`${automationId}:${signal.field ?? ''}`);
    },
  });
  watchers.load([
    {
      automationId: 'a',
      triggers: triggers.map((entry, index) => ({
        triggerId: `trigger-${String(index)}`,
        matcher: entry,
        pulse: false,
      })),
    },
  ]);
  bus.subscribe((signal) => {
    watchers.observe(signal);
  });
  return {
    clock,
    bus,
    fired,
    open: (appId, isOpen, kind = 'app_open'): void => {
      bus.emit(appSignal(appId, isOpen, clock.now().toISOString(), kind));
    },
  };
}

function minutes(count: number): string {
  return new Date(Date.parse(START) + count * 60_000).toISOString();
}

beforeEach(() => {
  captureLogs();
});

describe('an app staying open', () => {
  it('fires once the named app has been open for the hold time', () => {
    const test = setup([trigger({ match: { app: 'Firefox' } })]);
    test.open('firefox.desktop', true);
    test.clock.advanceTo(minutes(29));
    expect(test.fired).toEqual([]);
    test.clock.advanceTo(minutes(31));
    expect(test.fired).toEqual(['a:firefox.desktop']);
  });

  it('does not fire when the app closes before the hold time', () => {
    const test = setup([trigger({ match: { app: 'Firefox' } })]);
    test.open('firefox.desktop', true);
    test.clock.advanceTo(minutes(10));
    test.open('firefox.desktop', false);
    test.clock.advanceTo(minutes(60));
    expect(test.fired).toEqual([]);
  });

  it('ignores other apps for a named app', () => {
    const test = setup([trigger({ match: { app: 'Firefox' } })]);
    test.open('org.kde.kate', true);
    test.clock.advanceTo(minutes(60));
    expect(test.fired).toEqual([]);
  });

  it('times each app on its own when any app is wanted', () => {
    const test = setup([trigger({})]);
    test.open('firefox.desktop', true);
    test.clock.advanceTo(minutes(20));
    test.open('org.kde.kate', true);
    test.clock.advanceTo(minutes(25));
    test.open('org.kde.kate', false);
    test.clock.advanceTo(minutes(31));
    expect(test.fired).toEqual(['a:firefox.desktop']);
    test.clock.advanceTo(minutes(120));
    expect(test.fired).toEqual(['a:firefox.desktop']);
  });

  it('fires for an app that has been in front for the hold time', () => {
    const test = setup([trigger({ kind: 'app_focus', holdSeconds: 600 })]);
    test.open('firefox.desktop', true, 'app_focus');
    test.clock.advanceTo(minutes(11));
    expect(test.fired).toEqual(['a:firefox.desktop']);
  });

  it('fires when the app closes if that is what is waited for', () => {
    const test = setup([
      trigger({ test: { is: 'eq', to: false }, holdSeconds: undefined, match: { app: 'Firefox' } }),
    ]);
    test.open('firefox.desktop', true);
    test.open('firefox.desktop', false);
    expect(test.fired).toEqual(['a:firefox.desktop']);
  });
});

describe('the computer signals', () => {
  it('are registered with an app id as the free field and the app match keys', () => {
    const source = SIGNAL_SOURCES.find((entry) => entry.source === 'computer');
    expect(source?.kinds.map((kind) => [kind.kind, kind.fields, kind.pulse])).toEqual([
      ['app_open', 'free', false],
      ['app_focus', 'free', false],
    ]);
    expect(source?.kinds[0]?.match.map((entry) => entry.key)).toEqual([
      'app',
      'appId',
      'title',
      'user',
      'personId',
    ]);
  });

  it('accept a trigger that names a match key and refuse an unknown one', () => {
    expect(
      signalTriggerError(SIGNAL_SOURCES, {
        source: 'computer',
        kind: 'app_open',
        match: { app: 'Firefox' },
      }),
    ).toBeNull();
    expect(
      signalTriggerError(SIGNAL_SOURCES, {
        source: 'computer',
        kind: 'app_open',
        match: { colour: 'red' },
      }),
    ).not.toBeNull();
  });

  it('are refused by the bus without an app id', () => {
    const test = setup([trigger({})]);
    test.bus.emit({ ...appSignal('firefox.desktop', true, START, 'app_open'), field: null });
    test.clock.advanceTo(minutes(60));
    expect(test.fired).toEqual([]);
  });
});
