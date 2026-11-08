import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RowChange } from '@smarteverything/domain';
import { setMessageReaction } from '../../src/assistant/message-reactions';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { EngineRegistry } from '../../src/assistant/engines/registry';
import { AssistantFiles } from '../../src/assistant/files';
import type { Store } from '../../src/store/store';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { testStore } from '../support/store';
import { hubLayout } from '../../src/data-layout';

function createChat(store: Store, profileId: string): string {
  return store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Reactions',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  }).id;
}

function createMessage(store: Store, chatId: string, profileId: string): string {
  return store.assistantChat.addMessage({
    profile_id: profileId,
    client_id: null,
    chat_id: chatId,
    role: 'person',
    kind: 'text',
    author: 'Pat',
    text: 'Check the plan',
    attachments: [],
    state: 'answered',
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
  }).id;
}

describe('assistant message reactions', () => {
  it('publishes only membership changes, keeps timestamps and drops membership with the target', async () => {
    const { store, directory, close } = await testStore();
    try {
      const person = store.profiles.create({ name: 'Pat' });
      const chatId = createChat(store, person.id);
      const messageId = createMessage(store, chatId, person.id);
      const original = store.assistantChat.message(messageId);
      const seen: RowChange[] = [];
      store.feed.subscribe((change) => seen.push(change));
      const target = { chatId, messageId, emoji: '❤️' };
      const human = { kind: 'person', id: person.id, label: person.name } as const;
      const assistant = { kind: 'assistant', id: chatId, label: 'Planner' } as const;
      store.assistantReactions.set({ ...target, actor: human, present: true });
      store.assistantReactions.set({
        ...target,
        actor: { ...human, label: 'Renamed' },
        present: true,
      });
      store.assistantReactions.set({ ...target, actor: assistant, present: true });
      const reacted = store.assistantChat.message(messageId);
      expect(reacted).toEqual({
        ...original,
        reactions: [
          { emoji: target.emoji, actor: human },
          { emoji: target.emoji, actor: assistant },
        ],
      });
      expect(store.assistantChat.messages({ chatId, limit: 10 })).toEqual([reacted]);
      store.assistantReactions.set({ ...target, actor: human, present: false });
      store.assistantReactions.set({ ...target, actor: human, present: false });
      expect(store.assistantChat.message(messageId).reactions).toEqual([
        { emoji: target.emoji, actor: assistant },
      ]);
      expect(seen.map(({ operation }) => operation)).toEqual(['UPDATE', 'UPDATE', 'UPDATE']);
      store.assistantChat.removeMessages([messageId]);
      const reader = new DatabaseSync(join(directory, 'test.db'), { readOnly: true });
      try {
        expect(reader.prepare('select * from assistant_reactions').all()).toEqual([]);
      } finally {
        reader.close();
      }
    } finally {
      await close();
    }
  });

  it('derives the human profile and rejects cross-chat or unauthenticated actor targeting', async () => {
    const { store, directory, close } = await testStore();
    try {
      const admission = fixtureAdmission(store, directory);
      const client = store.clients.create(
        { name: 'Paired phone', platform: 'android', role: 'member', tokenHash: 'reaction-test' },
        false,
      );
      const profile = store.profiles.activeOf(client.id);
      const chatId = createChat(store, profile.id);
      const unrelatedChat = createChat(store, profile.id);
      const messageId = createMessage(store, chatId, profile.id);
      const change = { emoji: '👍', present: true };
      setMessageReaction(admission, { kind: 'client', client }, { chatId, messageId }, change);
      expect(store.assistantChat.message(messageId).reactions).toEqual([
        { emoji: '👍', actor: { kind: 'person', id: profile.id, label: profile.name } },
      ]);
      expect(() =>
        setMessageReaction(
          admission,
          { kind: 'client', client },
          { chatId: unrelatedChat, messageId },
          change,
        ),
      ).toThrow(/no longer available/u);
      expect(() =>
        setMessageReaction(
          admission,
          { kind: 'client', client, via: 'assistant' },
          { chatId, messageId },
          change,
        ),
      ).toThrow(/admitted chat/u);
    } finally {
      await close();
    }
  });
});

function fixtureAdmission(
  store: Store,
  directory: string,
): Parameters<typeof setMessageReaction>[0] {
  const files = new AssistantFiles({
    layout: hubLayout(directory, {}),
    chat: store.assistantChat,
    now: store.now,
  });
  const engines = new EngineRegistry(store);
  engines.attach({
    kind: 'claude',
    ownerOnly: true,
    status: () => ({ state: 'ready', reason: null }),
    deliver: () => Promise.resolve(),
    historyChanged: () => Promise.resolve(),
    compact: () => Promise.resolve(false),
    interrupt: () => Promise.resolve(),
  });
  return { store, chats: new ChatDirectory(store, files), engines };
}

it('refuses retired history and member mutations of computer chats', async () => {
  const { store, directory, close } = await testStore();
  try {
    const admission = fixtureAdmission(store, directory);
    const client = store.clients.create(
      {
        name: 'Paired phone',
        platform: 'android',
        role: 'member',
        tokenHash: 'reaction-native-test',
      },
      false,
    );
    const profile = store.profiles.activeOf(client.id);
    for (const status of ['retired', 'standalone'] as const) {
      const chat = store.aiChats.create({
        profileId: profile.id,
        kind: 'chat',
        title: 'Computer chat',
        icon: null,
        parentId: null,
        sourceKey: null,
        engine: CLAUDE_TEST_ENGINE,
        nativeAdmission: status,
      });
      const messageId = createMessage(store, chat.id, profile.id);
      expect(() =>
        setMessageReaction(
          admission,
          { kind: 'client', client },
          { chatId: chat.id, messageId },
          { emoji: '👍', present: true },
        ),
      ).toThrow(status === 'retired' ? /read-only/u : /Only the home owner/u);
      expect(store.assistantChat.message(messageId).reactions).toEqual([]);
    }
  } finally {
    await close();
  }
});
