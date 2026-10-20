import { type SignalInput, type SignalMatcher } from '@smarteverything/domain';
import { bench, describe } from 'vitest';
import { SignalWatch } from '../../src/signals/signal-watch';
import { SignalWatchers, type WatchedTrigger } from '../../src/signals/signal-watchers';
import { FakeClock } from '../../test/support/fake-clock';
import { MemoryWatchState } from '../../test/support/watch-state';

const TRIGGERS = 69;
const KINDS = ['state', 'press', 'app_open', 'app_focus', 'forecast', 'person_arrived'];
const SOURCES = ['device', 'computer', 'weather', 'event'] as const;

function matcherAt(index: number): SignalMatcher {
  return {
    source: SOURCES[index % SOURCES.length] ?? 'device',
    kind: KINDS[index % KINDS.length] ?? 'state',
    subject: `subject-${String(index)}`,
    field: 'power',
  };
}

const MATCHERS = Array.from({ length: TRIGGERS }, (_, index) => matcherAt(index));

function signalAt(index: number): SignalInput {
  const matcher = MATCHERS[index % TRIGGERS] ?? matcherAt(0);
  return {
    source: matcher.source,
    kind: matcher.kind,
    subject: index % 3 === 0 ? (matcher.subject ?? null) : 'other',
    field: 'power',
    value: index % 2 === 0,
    previous: null,
    at: '2026-10-18T10:00:00.000Z',
    profileId: null,
    data: {},
  };
}

const SIGNALS = Array.from({ length: 1000 }, (_, index) => signalAt(index));

const triggers: WatchedTrigger[] = MATCHERS.map((matcher, index) => ({
  triggerId: `#${String(index)}`,
  matcher,
  pulse: true,
}));

const indexed = new SignalWatchers({
  clock: new FakeClock('2026-10-18T10:00:00.000Z'),
  timeZone: (): string => 'UTC',
  state: new MemoryWatchState(),
  fire: (): void => undefined,
});
indexed.load([{ automationId: 'bench', triggers }]);

const clock = new FakeClock('2026-10-18T10:00:00.000Z');
const linear = MATCHERS.map(
  (matcher) =>
    new SignalWatch({
      matcher,
      pulse: true,
      clock,
      timeZone: (): string => 'UTC',
      persistence: null,
      fire: (): void => undefined,
    }),
);

describe('signals through 69 triggers, 1000 signals per iteration', () => {
  bench('linear scan (before)', () => {
    for (const signal of SIGNALS) {
      for (const watch of linear) watch.observe(signal);
    }
  });
  bench('indexed by source and kind (after)', () => {
    for (const signal of SIGNALS) indexed.observe(signal);
  });
});
