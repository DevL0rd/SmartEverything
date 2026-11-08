import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow, ChatActivityNotice } from '@smarteverything/domain';
import { withFrame, withSnapshot } from './chat-turns';
import { EntityStore } from './entity-store';
import { makeTable } from './state';
import { turnsOfChat } from './subscriptions';

const AT = '2026-11-05T06:00:00.000Z';
const CHAT = 'chat';
const TURN = 'turn';
const REPLY = 'reply';

function reply(state: AssistantMessageRow['state']): AssistantMessageRow {
  return {
    id: REPLY,
    profile_id: 'owner',
    client_id: null,
    role: 'responder',
    kind: 'text',
    author: 'Assistant',
    text: 'The saved answer',
    attachments: [],
    quote: null,
    state,
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: CHAT,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: AT,
    updated_at: AT,
  };
}

function activity(state: ChatActivityNotice['state']): ChatActivityNotice {
  return {
    type: 'chat_activity',
    chatId: CHAT,
    turnId: TURN,
    messageId: REPLY,
    seq: 0,
    state,
    steps: [],
    draft: '',
    reasoning: '',
    tools: [],
    finish: null,
    reason: null,
  };
}

function observe(store: EntityStore, notice: ChatActivityNotice): void {
  store.update((state) => ({ ...state, turns: withSnapshot(state.turns, notice) }));
}

function save(store: EntityStore, row: AssistantMessageRow): void {
  store.update((state) => {
    const messages = state.tables.assistant_messages;
    const byId = { ...messages.byId, [row.id]: row };
    return {
      ...state,
      tables: {
        ...state.tables,
        assistant_messages: makeTable(byId, Object.keys(byId), messages.version + 1),
      },
    };
  });
}

describe('the live turn store', () => {
  it('keeps newer tool rows through an older idle notice until the reply is saved', () => {
    const store = new EntityStore();
    const tool = {
      kind: 'tool' as const,
      callId: 'lookup',
      name: 'search',
      title: 'Searching',
      state: 'done' as const,
      detail: null,
    };
    save(store, reply('working'));
    observe(store, activity('thinking'));
    store.update((state) => ({
      ...state,
      turns: withFrame(state.turns, {
        type: 'chat_stream',
        chatId: CHAT,
        turnId: TURN,
        seq: 1,
        parts: [tool],
      }),
    }));
    observe(store, activity('idle'));
    expect(store.get().turns[TURN]).toMatchObject({
      state: 'idle',
      seq: 1,
      tools: [{ callId: tool.callId, state: tool.state }],
    });

    save(store, reply('answered'));
    expect(store.get().turns[TURN]).toBeUndefined();
    expect(store.get().tables.assistant_messages.byId[REPLY]?.text).toBe('The saved answer');
  });

  it('also releases a turn when its terminal notice follows the saved reply', () => {
    const store = new EntityStore();
    observe(store, activity('thinking'));
    save(store, reply('failed'));
    expect(store.get().turns[TURN]?.state).toBe('thinking');
    observe(store, activity('failed'));
    expect(store.get().turns[TURN]).toBeUndefined();
  });

  it('does not accumulate finished streams across chats or disturb another chat’s projection', () => {
    const store = new EntityStore();
    observe(store, activity('thinking'));
    const active = turnsOfChat(store.get(), CHAT);
    for (const chatId of ['first', 'second', 'third']) {
      const turn = { ...activity('thinking'), chatId, turnId: chatId, messageId: null };
      observe(store, turn);
      observe(store, { ...turn, state: 'idle' });
      expect(turnsOfChat(store.get(), CHAT)).toBe(active);
    }
    expect(Object.keys(store.get().turns)).toEqual([TURN]);
  });
});
