import { SIGNAL_MATCHER, type SignalInput, type SignalMatcher } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignalWatchers } from '../../src/signals/signal-watchers';
import type { WatchKey } from '../../src/store/repositories/signal-watch-state';
import { saveAutomation } from '../support/automation-fixture';
import { FakeClock } from '../support/fake-clock';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = '2026-10-08T10:00:00.000Z';

let held: TestStore;

beforeEach(async () => {
  captureLogs();
  held = await testStore();
});

afterEach(async () => {
  await held.close();
});

interface Trigger {
  readonly triggerId: string;
  readonly matcher: SignalMatcher;
}

function silent(triggerId: string): Trigger {
  return {
    triggerId,
    matcher: SIGNAL_MATCHER.parse({ source: 'device', kind: 'state', silentSeconds: 60 }),
  };
}

function automation(name = 'Quiet'): string {
  return saveAutomation(held.store, { name }).id;
}

function start(
  clock: FakeClock,
  automationId: string,
  trigger: Trigger,
  fired: SignalInput[],
): SignalWatchers {
  const watchers = new SignalWatchers({
    clock,
    timeZone: (): string => 'UTC',
    state: held.store.signalWatchState,
    fire: (_id, signal): void => {
      fired.push(signal);
    },
  });
  watchers.load([
    {
      automationId,
      triggers: [{ ...trigger, pulse: false }],
    },
  ]);
  return watchers;
}

describe('the persisted watch state', () => {
  const key = (automationId: string, triggerId: string, partition = ''): WatchKey => ({
    automationId,
    triggerId,
    partition,
  });

  it('reads back what it saved and replaces it', () => {
    const id = automation();
    const repository = held.store.signalWatchState;
    expect(repository.load(key(id, 't'))).toBeNull();
    repository.save(key(id, 't'), { lastSeenMs: 5, period: 'day:2026-10-08', latched: true });
    expect(repository.load(key(id, 't'))).toEqual({
      lastSeenMs: 5,
      period: 'day:2026-10-08',
      latched: true,
    });
    repository.save(key(id, 't'), { lastSeenMs: null, period: null, latched: false });
    expect(repository.load(key(id, 't'))).toEqual({
      lastSeenMs: null,
      period: null,
      latched: false,
    });
  });

  it('keeps one row per partition and drops the triggers that are gone', () => {
    const id = automation();
    const repository = held.store.signalWatchState;
    const blank = { lastSeenMs: 1, period: null, latched: false };
    repository.save(key(id, 'a', 'x'), blank);
    repository.save(key(id, 'a', 'y'), blank);
    repository.save(key(id, 'b'), blank);
    repository.retain([{ automationId: id, triggerId: 'a' }]);
    expect(repository.load(key(id, 'a', 'x'))).not.toBeNull();
    expect(repository.load(key(id, 'a', 'y'))).not.toBeNull();
    expect(repository.load(key(id, 'b'))).toBeNull();
  });

  it('is deleted together with its automation', () => {
    const id = automation();
    const other = automation('Other');
    const blank = { lastSeenMs: 1, period: null, latched: false };
    held.store.signalWatchState.save(key(id, 't'), blank);
    held.store.signalWatchState.save(key(other, 't'), blank);
    held.store.automations.remove(id);
    expect(held.store.signalWatchState.load(key(id, 't'))).toBeNull();
    expect(held.store.signalWatchState.load(key(other, 't'))).not.toBeNull();
  });

  it('lets a silence trigger survive a restart through the database', () => {
    const id = automation();
    const trigger = silent('3d000000-0000-4000-8000-000000000003');
    const clock = new FakeClock(START);
    const fired: SignalInput[] = [];
    const first = start(clock, id, trigger, fired);
    clock.advanceTo('2026-10-08T10:00:20.000Z');
    first.observe({
      source: 'device',
      kind: 'state',
      subject: 'a',
      field: 'power',
      value: true,
      previous: null,
      at: '2026-10-08T10:00:20.000Z',
      profileId: null,
      data: {},
    });
    first.stop();
    clock.advanceTo('2026-10-08T10:00:50.000Z');
    start(clock, id, trigger, fired);
    clock.advanceTo('2026-10-08T10:01:19.000Z');
    expect(fired).toHaveLength(0);
    clock.advanceTo('2026-10-08T10:01:21.000Z');
    expect(fired).toHaveLength(1);
  });
});
