import { CLIENT_PREFS, type RowChange, type SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActionOrigin } from '../src/automations/automation-ai';
import { SignalBus } from '../src/signals/bus';
import { feedSignals } from '../src/signals/sources/feed';
import { feedContextOf } from '../src/signals/sources/feed-context';
import { clockTextIn } from '../src/clock/person-clock';
import { WAKE_GATHER_MS, WakeRunner, type WakeTurnInput } from '../src/wake/wake-runner';
import { WakeText } from '../src/wake/wake-text';
import { FakeClock } from './support/fake-clock';
import { node, saveAutomation, trigger } from './support/automation-fixture';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';
import { TEST_ENGINE } from './support/engine';

const START = '2026-10-08T10:00:00.000Z';

const afterStart = (ms: number): string => new Date(Date.parse(START) + ms).toISOString();
const CAMERA = '1d000000-0000-4000-8000-000000000009';

interface Bench {
  readonly opened: TestStore;
  readonly clock: FakeClock;
  readonly turns: WakeTurnInput[];
  readonly runner: WakeRunner;
  readonly profileId: string;
  readonly chatId: string;
  readonly origin: ActionOrigin;
  failNext: boolean;
}

function signalOf(overrides: Partial<SignalInput>): SignalInput {
  return {
    source: 'event',
    kind: 'motion',
    subject: CAMERA,
    field: null,
    value: true,
    previous: null,
    at: START,
    profileId: null,
    data: {},
    ...overrides,
  };
}

async function bench(): Promise<Bench> {
  const opened = await testStore();
  await opened.store.live.home.load();
  const clock = new FakeClock(START);
  const profileId = opened.store.profiles.first().id;
  const chat = opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
  const automation = saveAutomation(opened.store, {
    name: 'Baby monitor',
    triggers: [trigger('trigger.interval', { every: 300_000 })],
    body: [node('flow.wait', { duration: 1000 })],
  });
  const turns: WakeTurnInput[] = [];
  const state: Bench = {
    opened,
    clock,
    turns,
    profileId,
    chatId: chat.id,
    origin: {
      automationId: automation.id,
      name: automation.name,
      signal: signalOf({}),
      plugin: null,
    },
    failNext: false,
    runner: new WakeRunner({
      store: opened.store,
      turns: {
        run: (input): Promise<{ chatId: string }> => {
          if (state.failNext) {
            return Promise.reject(new Error('The AI backend is not set up.'));
          }
          turns.push(input);
          return Promise.resolve({ chatId: input.chatId ?? chat.id });
        },
      },
      clock,
      log: testLogger('wake'),
    }),
  };
  return state;
}

let current: Bench;

async function gathered(): Promise<void> {
  await current.opened.store.host.read('homeMirror', null);
  await current.opened.store.host.call('aiWakes', 'recent', current.profileId, 1);
}

beforeEach(async () => {
  current = await bench();
});

afterEach(async () => {
  current.runner.stop();
  await current.opened.close();
});

function wakeAction(chatId: string | null): {
  type: 'wake_ai';
  profileId: string;
  chatId: string | null;
  instruction: string;
} {
  return {
    type: 'wake_ai',
    profileId: current.profileId,
    chatId,
    instruction: 'Check on the baby',
  };
}

describe('WakeRunner', () => {
  it('gathers wakes for one chat inside the gather window into one turn', async () => {
    const first = current.runner.wake(wakeAction(current.chatId), current.origin);
    await gathered();
    current.clock.advanceTo(afterStart(WAKE_GATHER_MS / 2));
    const second = current.runner.wake(wakeAction(current.chatId), current.origin);
    await gathered();
    expect(current.turns).toHaveLength(0);
    current.clock.advanceTo(afterStart(WAKE_GATHER_MS));
    await Promise.all([first, second]);
    await gathered();
    expect(current.turns).toHaveLength(1);
    expect(current.turns[0]?.text.match(/\[Wake\]/g)).toHaveLength(2);
    expect(current.turns[0]?.text).toContain('Do this: Check on the baby');
    const rows = current.opened.store.aiWakes.recent(current.profileId, 10);
    expect(rows.map((row) => row.state)).toEqual(['woke', 'woke']);
  });

  it('starts a new chat when none is named', async () => {
    const woke = current.runner.wake(wakeAction(null), current.origin);
    await gathered();
    current.clock.advanceTo(afterStart(WAKE_GATHER_MS));
    await woke;
    expect(current.turns[0]?.chatId).toBeNull();
    expect(current.turns[0]?.title).toBe('Baby monitor');
  });

  it('refuses to wake the chat whose reply caused the signal', async () => {
    const origin = {
      ...current.origin,
      signal: signalOf({ source: 'assistant', kind: 'reply_finished', subject: current.chatId }),
    };
    await expect(current.runner.wake(wakeAction(current.chatId), origin)).rejects.toThrow(
      'repeat forever',
    );
    await gathered();
    expect(current.opened.store.aiWakes.recent(current.profileId, 10)[0]?.state).toBe('refused');
  });

  it('refuses a chat that belongs to someone else', async () => {
    const other = current.opened.store.profiles.create({ name: 'Sam' });
    const action = { ...wakeAction(current.chatId), profileId: other.id };
    await expect(current.runner.wake(action, current.origin)).rejects.toThrow('someone else');
  });

  it('records a failed turn and rejects the automation step', async () => {
    current.failNext = true;
    const woke = current.runner.wake(wakeAction(current.chatId), current.origin);
    await gathered();
    current.clock.advanceTo(afterStart(WAKE_GATHER_MS));
    await expect(woke).rejects.toThrow('not set up');
    await gathered();
    const row = current.opened.store.aiWakes.recent(current.profileId, 10)[0];
    expect(row?.state).toBe('failed');
    expect(row?.reason).toContain('not set up');
  });
});

describe('signal bus values', () => {
  it('drops unchanged values of steady signals and fills in the previous one', () => {
    const bus = new SignalBus({ log: testLogger('signals') });
    const seen: SignalInput[] = [];
    bus.subscribe((signal) => seen.push(signal));
    const steps = (value: number): SignalInput =>
      signalOf({
        source: 'health',
        kind: 'today',
        subject: current.profileId,
        field: 'steps',
        value,
      });
    bus.emit(steps(100));
    bus.emit(steps(100));
    bus.emit(steps(250));
    expect(seen.map((signal) => [signal.value, signal.previous])).toEqual([
      [100, null],
      [250, 100],
    ]);
    expect(bus.latest({ source: 'health', field: 'steps' })[0]?.value).toBe(250);
  });
});

describe('feed signals', () => {
  const context = feedContextOf(new Date(START), () => 'UTC');

  function daily(day: string): RowChange {
    return {
      type: 'change',
      table: 'health_daily',
      operation: 'INSERT',
      record: {
        profile_id: current.profileId,
        day,
        metric: 'resting_heart_rate',
        value: 61,
        unit: 'bpm',
        updated_at: START,
      },
      oldRecord: null,
    };
  }

  it('turns only today’s health totals into signals', () => {
    expect(feedSignals(daily('2026-10-08'), context)).toHaveLength(1);
    expect(feedSignals(daily('2026-10-07'), context)).toHaveLength(0);
  });
});

describe('WakeText', () => {
  it('writes the wake time on the person’s chosen clock', () => {
    const { store } = current.opened;
    const zone = store.settings.read().time_zone;
    const occasion = {
      automationName: 'Baby monitor',
      signal: null,
      instruction: 'Check on the baby',
      at: new Date('2026-10-08T15:05:00.000Z'),
      profileId: current.profileId,
    };
    const text = new WakeText(store);
    for (const hour24 of [true, false]) {
      store.personal.saveLayout(
        { clientId: CAMERA, profileId: current.profileId },
        CLIENT_PREFS.clock_format.storageKey,
        CLIENT_PREFS.clock_format.encode({ hour24 }),
      );
      expect(text.lines(occasion).headline).toBe(
        `Baby monitor · ${clockTextIn(occasion.at, zone, hour24)}`,
      );
    }
  });
});
