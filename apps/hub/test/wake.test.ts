import { DEFAULT_ENGINE, type RowChange, type SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActionOrigin } from '../src/automations/actions';
import { SignalBus } from '../src/signals/bus';
import { feedSignals } from '../src/signals/sources/feed';
import { feedContextOf } from '../src/signals/sources/feed-context';
import { WakeRunner, type WakeTurnInput } from '../src/wake/wake-runner';
import { FakeClock } from './support/fake-clock';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const START = '2026-10-08T10:00:00.000Z';
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
  const clock = new FakeClock(START);
  const profileId = opened.store.profiles.first().id;
  const chat = opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  });
  const automation = opened.store.automations.create({
    name: 'Baby monitor',
    enabled: true,
    definition: {
      triggers: [{ type: 'interval', everyMinutes: 5 }],
      conditions: { mode: 'all', items: [] },
      actions: [{ type: 'delay', seconds: 1 }],
    },
  });
  const turns: WakeTurnInput[] = [];
  const state: Bench = {
    opened,
    clock,
    turns,
    profileId,
    chatId: chat.id,
    origin: { automationId: automation.id, name: automation.name, signal: signalOf({}) },
    failNext: false,
    runner: new WakeRunner({
      store: opened.store,
      turns: {
        run: (input): { chatId: string } => {
          if (state.failNext) {
            throw new Error('The AI backend is not set up.');
          }
          turns.push(input);
          return { chatId: input.chatId ?? chat.id };
        },
      },
      clock,
      log: testLogger('wake'),
    }),
  };
  return state;
}

let current: Bench;

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
  it('gathers wakes for one chat within three seconds into one turn', async () => {
    const first = current.runner.wake(wakeAction(current.chatId), current.origin);
    current.clock.advanceTo('2026-10-08T10:00:02.000Z');
    const second = current.runner.wake(wakeAction(current.chatId), current.origin);
    expect(current.turns).toHaveLength(0);
    current.clock.advanceTo('2026-10-08T10:00:03.000Z');
    await Promise.all([first, second]);
    expect(current.turns).toHaveLength(1);
    expect(current.turns[0]?.text.match(/\[Wake\]/g)).toHaveLength(2);
    expect(current.turns[0]?.text).toContain('Do this: Check on the baby');
    const rows = current.opened.store.aiWakes.recent(current.profileId, 10);
    expect(rows.map((row) => row.state)).toEqual(['woke', 'woke']);
  });

  it('starts a new chat when none is named', async () => {
    const woke = current.runner.wake(wakeAction(null), current.origin);
    current.clock.advanceTo('2026-10-08T10:00:03.000Z');
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
    current.clock.advanceTo('2026-10-08T10:00:03.000Z');
    await expect(woke).rejects.toThrow('not set up');
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
      table: 'health_daily',
      operation: 'insert',
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
