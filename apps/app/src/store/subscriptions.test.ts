import { DeviceValueIndex } from './device-values';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import type { Turn } from './chat-turns';
import { tableOf } from './table-ops';
import { RULES } from './table-rules';
import { deviceValuesOf, emptyState, makeTable, type StoreState } from './state';
import {
  changedSlices,
  deviceValuesRecord,
  messagesSlice,
  messagesTable,
  ledgerEntry,
  pluginStreamRow,
  pluginStreamSlice,
  SubscriptionManager,
  TrackedViewLeakError,
  trackReads,
  turnsOfChat,
} from './subscriptions';

function withRooms(state: StoreState): StoreState {
  return { ...state, tables: { ...state.tables, rooms: makeTable({}, [], 1) } };
}

const CHAT_A = 'chat-a';
const CHAT_B = 'chat-b';

function turn(chatId: string, turnId: string, text: string): Turn {
  return {
    chatId,
    turnId,
    messageId: null,
    state: 'replying',
    seq: 1,
    text,
    reasoning: '',
    tools: [],
    steps: [],
    reason: null,
    behind: false,
    waiting: [],
  };
}

describe('changedSlices', () => {
  it('names only the top-level keys and tables whose reference changed', () => {
    const state = emptyState();
    const next = withRooms({ ...state, loaded: true });
    expect([...changedSlices(state, next)].sort()).toStrictEqual(['loaded', 'tables.rooms']);
  });

  it('is empty when nothing changed by reference', () => {
    const state = emptyState();
    expect(changedSlices(state, { ...state, tables: { ...state.tables } }).size).toBe(0);
  });

  it('names the device whose values changed, not the others', () => {
    const state = {
      ...emptyState(),
      deviceValues: DeviceValueIndex.from([
        ['a', {}],
        ['b', {}],
      ]),
    };
    const next = { ...state, deviceValues: state.deviceValues.set('a', {}) };
    expect([...changedSlices(state, next)].sort()).toStrictEqual([
      'deviceValues',
      'deviceValues/a',
    ]);
  });

  it('names the device of a ledger slot', () => {
    const entry = { commandId: null, value: 1, expiresAt: null, failure: null };
    const state = emptyState();
    const next = { ...state, ledger: { 'dev-1/power': entry } };
    expect([...changedSlices(state, next)].sort()).toStrictEqual(['ledger', 'ledger/dev-1']);
  });

  it('names the chat of a changed turn and the chat of a removed one', () => {
    const state = {
      ...emptyState(),
      turns: { t1: turn(CHAT_A, 't1', 'a'), t2: turn(CHAT_B, 't2', 'b') },
    };
    const next = { ...state, turns: { t1: turn(CHAT_A, 't1', 'ab') } };
    expect([...changedSlices(state, next)].sort()).toStrictEqual(
      [`turns/${CHAT_A}`, `turns/${CHAT_B}`, 'turns', 'turnWork'].sort(),
    );
  });

  it('names the plugin stream whose row changed, not the others', () => {
    const row = { plugin_id: 'p', stream: 'a', value: 1, at: 'x' };
    const state = emptyState();
    const streams = makeTable({ 'p/a': row, 'p/b': row }, ['p/a', 'p/b'], 1);
    const before = { ...state, tables: { ...state.tables, plugin_streams: streams } };
    const after = {
      ...before,
      tables: {
        ...before.tables,
        plugin_streams: makeTable({ 'p/a': { ...row, value: 2 }, 'p/b': row }, ['p/a', 'p/b'], 2),
      },
    };
    const changed = changedSlices(before, after);
    expect(changed.has(pluginStreamSlice('p/a'))).toBe(true);
    expect(changed.has(pluginStreamSlice('p/b'))).toBe(false);
    expect(trackReads(before, (s) => pluginStreamRow(s, 'p/b')).reads).toStrictEqual(
      new Set([pluginStreamSlice('p/b')]),
    );
  });

  it('ignores the sync sequence number and reports every other sync change', () => {
    const state = emptyState();
    expect(changedSlices(state, { ...state, sync: { ...state.sync, seq: 9 } }).size).toBe(0);
    expect([
      ...changedSlices(state, { ...state, sync: { ...state.sync, status: 'live' } }),
    ]).toStrictEqual(['sync']);
  });
});

describe('trackReads', () => {
  it('records the slices a selector reads, per table', () => {
    const state = emptyState();
    const { reads } = trackReads(state, (s) => [s.settings, s.tables.devices.ids, s.tables.rooms]);
    expect([...reads].sort()).toStrictEqual(['settings', 'tables.devices', 'tables.rooms']);
  });

  it('records the reads of a selector that runs inside another one', () => {
    const state = emptyState();
    const { reads } = trackReads(state, (s) => {
      trackReads(s, (inner) => inner.hub);
      return s.firewall;
    });
    expect([...reads]).toStrictEqual(['firewall']);
  });

  it('records one device or one chat instead of the whole slice', () => {
    const state = {
      ...emptyState(),
      deviceValues: DeviceValueIndex.from([['d1', {}]]),
      turns: { t1: turn(CHAT_A, 't1', '') },
    };
    const { reads } = trackReads(state, (s) => [
      deviceValuesRecord(s, 'd1'),
      ledgerEntry(s, 'd1/power'),
      turnsOfChat(s, CHAT_A),
    ]);
    expect([...reads].sort()).toStrictEqual(['deviceValues/d1', 'ledger/d1', `turns/${CHAT_A}`]);
  });

  it('gives per-device projections the real state so their caches hit', () => {
    const state = {
      ...emptyState(),
      deviceValues: DeviceValueIndex.from([['d1', { level: { value: 1, observedAt: 'x' } }]]),
    };
    const first = trackReads(state, (s) => deviceValuesOf(s, 'd1')).value;
    const again = trackReads(state, (s) => deviceValuesOf(s, 'd1')).value;
    expect(again).toBe(first);
    expect(deviceValuesOf(state, 'd1')).toBe(first);
  });

  it('refuses a selector that returns the whole tables view', () => {
    expect(() => trackReads(emptyState(), (s) => s.tables)).toThrow(TrackedViewLeakError);
  });
});

describe('SubscriptionManager', () => {
  it('wakes only subscribers whose reads intersect the changed slices', () => {
    const manager = new SubscriptionManager();
    const devices = vi.fn();
    const rooms = vi.fn();
    manager.add({ reads: new Set(['tables.devices']), wake: devices });
    manager.add({ reads: new Set(['tables.rooms']), wake: rooms });
    manager.mark(new Set(['tables.devices']));
    expect(manager.flush()).toBe(1);
    expect(devices).toHaveBeenCalledTimes(1);
    expect(rooms).not.toHaveBeenCalled();
  });

  it('always wakes a subscriber with no recorded reads', () => {
    const manager = new SubscriptionManager();
    const wake = vi.fn();
    manager.add({ reads: new Set(), wake });
    manager.mark(new Set(['hub']));
    manager.flush();
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it('merges every mark before a flush into one pass', () => {
    const manager = new SubscriptionManager();
    const wake = vi.fn();
    manager.add({ reads: new Set(['hub', 'session']), wake });
    manager.mark(new Set(['hub']));
    manager.mark(new Set(['session']));
    manager.flush();
    manager.flush();
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it('gates freshness by the version of the slices that were read', () => {
    const manager = new SubscriptionManager();
    const readAt = manager.version;
    manager.mark(new Set(['hub']));
    expect(manager.isFresh(new Set(['session']), readAt)).toBe(true);
    expect(manager.isFresh(new Set(['hub']), readAt)).toBe(false);
    expect(manager.isFresh(new Set(['hub']), manager.version)).toBe(true);
    expect(manager.isFresh(new Set(), manager.version)).toBe(false);
  });

  it('stops waking a removed subscriber', () => {
    const manager = new SubscriptionManager();
    const wake = vi.fn();
    const remove = manager.add({ reads: new Set(['hub']), wake });
    remove();
    manager.mark(new Set(['hub']));
    manager.flush();
    expect(wake).not.toHaveBeenCalled();
  });
});

function message(id: string, chat: string): AssistantMessageRow {
  const at = '2026-10-09T10:00:00.000Z';
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'x',
    text: 'hello',
    attachments: [],
    state: 'answered',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: chat,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: at,
    updated_at: at,
  };
}

function withMessages(state: StoreState, rows: readonly AssistantMessageRow[]): StoreState {
  return {
    ...state,
    tables: { ...state.tables, assistant_messages: tableOf(rows, RULES.assistant_messages, 1) },
  };
}

describe('per-chat message slices', () => {
  it('marks only the chats whose rows changed, plus the table', () => {
    const a = message('1', CHAT_A);
    const b = message('2', CHAT_B);
    const base = emptyState();
    const before = withMessages(base, [a, b]);
    const after = withMessages(base, [a, message('3', CHAT_B), b]);
    expect([...changedSlices(before, after)].sort()).toStrictEqual([
      messagesSlice(CHAT_B),
      'tables.assistant_messages',
    ]);
  });

  it('a reader of one chat records its chat slice and not the table', () => {
    const state = withMessages(emptyState(), [message('1', CHAT_A)]);
    const { reads } = trackReads(state, (s) => messagesTable(s, CHAT_A).ids);
    expect([...reads]).toStrictEqual([messagesSlice(CHAT_A)]);
  });
});
