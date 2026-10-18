import { describe, expect, it } from 'vitest';
import type { Turn } from './chat-turns';
import { deviceValuesOf, emptyState, makeTable, type StoreState } from './state';
import { changedSlices, SubscriptionManager, trackReads, turnsOfChat } from './subscriptions';

const CHATS = 12;
const DEVICES = 40;
const NOTICES = 1000;
const KINDS = ['deviceValues', 'turns', 'sync.seq', 'messages table', 'hub'] as const;

type Select = (state: StoreState) => unknown;

const chatId = (index: number): string => `chat-${String(index % CHATS)}`;
const deviceId = (index: number): string => `dev-${String(index % DEVICES)}`;

function selectors(): readonly Select[] {
  const perChatTurns: Select[] = Array.from(
    { length: 60 },
    (_, index) =>
      (s): unknown =>
        turnsOfChat(s, chatId(index)),
  );
  const perDevice: Select[] = Array.from(
    { length: DEVICES },
    (_, index) =>
      (s): unknown =>
        deviceValuesOf(s, deviceId(index)),
  );
  const deviceTable: Select[] = Array.from(
    { length: 20 },
    () =>
      (s): unknown =>
        s.tables.devices.rows,
  );
  const messages: Select[] = Array.from(
    { length: 30 },
    () =>
      (s): unknown =>
        s.tables.assistant_messages.rows,
  );
  const zone: Select[] = Array.from(
    { length: 100 },
    () =>
      (s): unknown =>
        s.settings?.time_zone ?? null,
  );
  const whole: Select[] = [
    (s): unknown => s.deviceValues,
    (s): unknown => s.deviceValues,
    (s): unknown => s.deviceValues,
    (s): unknown => s.turns,
    (s): unknown => s.turns,
    (s): unknown => s.sync.status,
    (s): unknown => s.sync.offlineSince,
    (s): unknown => s.session,
    (s): unknown => s.hub,
    (s): unknown => s.tables.rooms,
  ];
  return [...perChatTurns, ...perDevice, ...deviceTable, ...messages, ...zone, ...whole];
}

function turnOf(chat: string, version: number): Turn {
  return {
    chatId: chat,
    turnId: `turn-${chat}`,
    messageId: null,
    state: 'replying',
    seq: version,
    text: 'x'.repeat(version % 50),
    reasoning: '',
    tools: [],
    steps: [],
    reason: null,
    behind: false,
    waiting: [],
  };
}

function notice(state: StoreState, index: number): StoreState {
  switch (index % 5) {
    case 0:
      return {
        ...state,
        deviceValues: state.deviceValues.set(deviceId(index), {
          level: { value: index, observedAt: 'now' },
        }),
      };
    case 1:
      return {
        ...state,
        turns: { ...state.turns, [`turn-${chatId(index)}`]: turnOf(chatId(index), index) },
      };
    case 2:
      return { ...state, sync: { ...state.sync, seq: index } };
    case 3:
      return {
        ...state,
        tables: { ...state.tables, assistant_messages: makeTable({}, [], index) },
      };
    default:
      return { ...state, hub: null, weather: null };
  }
}

describe('subscription evaluation counts', () => {
  it('runs a few selectors per notice instead of one pass over every listener', () => {
    const all = selectors();
    let state = emptyState();
    const manager = new SubscriptionManager();
    let evaluations = 0;
    for (const select of all) {
      const subscriber = {
        reads: trackReads(state, select).reads,
        wake: (): void => {
          evaluations += 1;
          subscriber.reads = trackReads(state, select).reads;
        },
      };
      manager.add(subscriber);
    }
    const perKind = KINDS.map(() => 0);
    const started = performance.now();
    for (let index = 0; index < NOTICES; index += 1) {
      const previous = state;
      state = notice(state, index);
      manager.mark(changedSlices(previous, state));
      const before = evaluations;
      manager.flush();
      perKind[index % 5] = (perKind[index % 5] ?? 0) + evaluations - before;
    }
    const elapsed = performance.now() - started;
    const kinds = KINDS.map(
      (kind, index) => `${kind} ${((perKind[index] ?? 0) / (NOTICES / 5)).toFixed(1)}`,
    ).join(', ');
    process.stdout.write(
      `listeners ${String(all.length)}; evaluations per notice before ${String(all.length)}, after ${(evaluations / NOTICES).toFixed(1)} (${kinds}); ${elapsed.toFixed(1)} ms for ${String(NOTICES)} notices\n`,
    );
    for (const [index, total] of perKind.entries()) {
      if (index !== 3) expect(total / (NOTICES / 5)).toBeLessThan(10);
    }
  });
});
