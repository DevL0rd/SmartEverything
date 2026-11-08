import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  AiChatRow,
  AssistantMessageRow,
  ClientRow,
  DshSessionEvent,
} from '@smarteverything/domain';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { Delegation } from '../../src/assistant/delegation/delegation';
import { activeHelperInput } from '../../src/assistant/engines/dsh/helper-reaction-input';
import { EngineRegistry } from '../../src/assistant/engines/registry';
import { AssistantFiles } from '../../src/assistant/files';
import { setMessageReaction } from '../../src/assistant/message-reactions';
import { eventAuthority } from '../../src/assistant/turn-authority';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import type { Store } from '../../src/store/store';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { testStore, type TestStore } from '../support/store';
import { hubLayout } from '../../src/data-layout';

function enginesFor(store: Store): EngineRegistry {
  const engines = new EngineRegistry(store);
  engines.attach({
    kind: 'claude',
    ownerOnly: true,
    status: () => ({ state: 'ready', reason: null }),
    deliver: () => Promise.resolve(),
    preflightHelperInput: () => Promise.resolve(),
    historyChanged: () => Promise.resolve(),
    compact: () => Promise.resolve(false),
    interrupt: () => Promise.resolve(),
  });
  return engines;
}

interface ReactionFixture {
  readonly store: Store;
  readonly client: ClientRow;
  readonly parent: AiChatRow;
  readonly helper: (name: string) => AiChatRow;
  readonly send: (target: AiChatRow) => Promise<AssistantMessageRow>;
  readonly notices: () => number;
  readonly ports: Parameters<typeof setMessageReaction>[0];
}

function fixture({ store, directory }: TestStore): ReactionFixture {
  const client = store.clients.create(
    { name: 'Desktop', platform: 'desktop', role: 'owner', tokenHash: 'parent-reaction-test' },
    true,
  );
  const profile = store.profiles.activeOf(client.id);
  const owner = { profileId: profile.id, role: 'owner' } as const;
  const files = new AssistantFiles({
    layout: hubLayout(directory, {}),
    chat: store.assistantChat,
    now: store.now,
  });
  const chats = new ChatDirectory(store, files);
  const conversation = new ConversationLog(store);
  const engines = enginesFor(store);
  let notices = 0;
  const delegation = new Delegation({
    store,
    chats,
    conversation,
    now: store.now,
    added: (): void => {
      notices += 1;
    },
  });
  const parent = chats.create(owner, { title: 'Planner', engine: TEST_ENGINE });
  const helper = (name: string): AiChatRow =>
    chats.create(owner, { title: name, engine: CLAUDE_TEST_ENGINE, parent_id: parent.id });
  const send = (target: AiChatRow): Promise<AssistantMessageRow> =>
    delegation.sendToHelper(
      { clientId: client.id, profileId: profile.id },
      parent,
      {
        text: 'Please check this.',
        attachments: [],
        client_message_id: randomUUID(),
        helper_target: { chat_id: target.id },
      },
      { engines, files },
    );
  return {
    store,
    client,
    parent,
    helper,
    send,
    notices: (): number => notices,
    ports: { store, chats, engines },
  };
}

function expectInput(
  store: Store,
  chatId: string,
): { readonly event: StoredEvent; readonly target: Parameters<typeof setMessageReaction>[2] } {
  const event = store.assistantEvents.pending().find((row) => row.chat_id === chatId);
  if (event?.message_id === undefined || event.message_id === null)
    throw new Error('Expected a stored helper input.');
  return { event, target: { chatId, messageId: event.message_id } };
}

describe('delivery-bound parent reactions', () => {
  it('reacts as the helper to the exact parent projection without disclosing memberships or starting work', async () => {
    const opened = await testStore();
    try {
      const setup = fixture(opened);
      const { store, parent, ports, client } = setup;
      const child = setup.helper('Keyboard review');
      const parentRow = await setup.send(child);
      const { event, target } = expectInput(store, child.id);
      const authority = eventAuthority(store, event);
      const actor = {
        kind: 'client',
        client,
        via: 'assistant',
        chatId: child.id,
        authority,
      } as const;
      const change = { emoji: '👍', present: true, in_parent: true };
      expect(() => setMessageReaction(ports, actor, target, change)).toThrow(
        /currently delivered/u,
      );
      store.assistantEvents.mark(event.id, 'delivered_at');

      const humanTarget = { chatId: parent.id, messageId: parentRow.id };
      setMessageReaction(ports, { kind: 'client', client }, humanTarget, {
        emoji: '👍',
        present: true,
      });
      expect(() =>
        setMessageReaction(ports, actor, { chatId: child.id, messageId: parentRow.id }, change),
      ).toThrow(/currently delivered/u);
      expect(() => setMessageReaction(ports, { kind: 'client', client }, target, change)).toThrow(
        /currently delivered/u,
      );
      const expected = [
        { emoji: '👍', actor: { kind: 'assistant', id: child.id, label: child.helper_name } },
      ];
      expect(setMessageReaction(ports, actor, target, change)).toEqual(expected);
      expect(setMessageReaction(ports, actor, target, change)).toEqual(expected);
      expect(store.assistantChat.message(parentRow.id).reactions).toHaveLength(2);
      expect(store.assistantChat.message(target.messageId).reactions).toEqual([]);
      expect(setMessageReaction(ports, actor, target, { emoji: '👍', present: true })).toEqual(
        expected,
      );
      expect(setMessageReaction(ports, actor, target, { ...change, present: false })).toEqual([]);
      expect(store.assistantChat.message(parentRow.id).reactions).toHaveLength(1);
      expect(setup.notices()).toBe(1);
      expect(store.assistantEvents.pending()).toEqual([]);

      store.assistantEvents.mark(event.id, 'answered_at');
      expect(() => setMessageReaction(ports, actor, target, change)).toThrow(
        /currently delivered/u,
      );
    } finally {
      await opened.close();
    }
  });

  it('refuses a sibling input and a different delivery addressed to the same helper', async () => {
    const opened = await testStore();
    try {
      const setup = fixture(opened);
      const { store, client, ports } = setup;
      const child = setup.helper('First');
      const sibling = setup.helper('Second');
      await setup.send(child);
      const first = expectInput(store, child.id);
      store.assistantEvents.mark(first.event.id, 'delivered_at');
      await setup.send(child);
      const next = expectInput(store, child.id);
      store.assistantEvents.mark(next.event.id, 'delivered_at');
      await setup.send(sibling);
      const foreign = expectInput(store, sibling.id);
      store.assistantEvents.mark(foreign.event.id, 'delivered_at');

      const authority = eventAuthority(store, next.event);
      const actor = {
        kind: 'client',
        client,
        via: 'assistant',
        chatId: child.id,
        authority,
      } as const;
      const change = { emoji: '👍', present: true, in_parent: true };
      expect(() => setMessageReaction(ports, actor, first.target, change)).toThrow(
        /currently delivered/u,
      );
      expect(() =>
        setMessageReaction(ports, actor, { ...foreign.target, chatId: child.id }, change),
      ).toThrow(/currently delivered/u);
    } finally {
      await opened.close();
    }
  });
});

describe('native helper input proof', () => {
  it('requires the exact helper source appended in a turn and expires at its end', () => {
    const id = randomUUID();
    const data = {
      id: randomUUID(),
      role: 'user',
      source: { kind: 'smarteverything-helper-input', deliveryId: id },
      content: [{ type: 'text', text: 'work' }],
    };
    const inbox: DshSessionEvent = {
      type: 'agent/inbox/spliced',
      seq: 0,
      time: 1,
      ignorable: true,
      data: { target: 'next-turn', start: 0, inserted: [data] },
    };
    const start: DshSessionEvent = { type: 'turn/start', seq: 1, time: 2, data: { turn: 1 } };
    const appended: DshSessionEvent = {
      type: 'user/message',
      seq: 2,
      time: 3,
      surfaceOp: 'append',
      data,
    };
    const end: DshSessionEvent = {
      type: 'turn/end',
      seq: 3,
      time: 4,
      data: { turn: 1, reason: { kind: 'completed' } },
    };
    expect(activeHelperInput([inbox, start], id)).toBe(false);
    expect(activeHelperInput([inbox, start, appended], randomUUID())).toBe(false);
    expect(
      activeHelperInput(
        [start, { ...appended, data: { ...data, id, source: { kind: 'user' } } }],
        id,
      ),
    ).toBe(false);
    expect(activeHelperInput([inbox, start, appended], id)).toBe(true);
    expect(activeHelperInput([inbox, start, appended, end], id)).toBe(false);
  });
});
