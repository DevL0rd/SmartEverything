import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { AssistantFiles } from '../../src/assistant/files';
import { testStore, type TestStore } from '../support/store';
import { hubLayout } from '../../src/data-layout';

const START = Date.parse('2026-10-10T10:00:00.000Z');

let opened: TestStore;
let chats: ChatDirectory;
let clock: number;
let profileId: string;

function minutesLater(minutes: number): void {
  clock = START + minutes * 60_000;
}

beforeEach(async () => {
  clock = START;
  const now = (): Date => new Date(clock);
  opened = await testStore(now);
  const { store } = opened;
  profileId = store.profiles.first().id;
  chats = new ChatDirectory(
    store,
    new AssistantFiles({ layout: hubLayout(opened.directory, {}), chat: store.assistantChat, now }),
  );
});

afterEach(async () => {
  await opened.close();
});

describe('conversation chats', () => {
  it('keeps using the same conversation chat however long it was quiet', () => {
    const first = chats.conversationChat(profileId);
    minutesLater(60 * 24 * 30);
    expect(chats.conversationChat(profileId).id).toBe(first.id);
  });

  it('names the conversation chat after the AI and keeps the name when it is used', () => {
    expect(chats.conversationChat(profileId)).toMatchObject({ title: 'Coordinator' });
    const settings = opened.store.assistantChat.settings();
    opened.store.assistantChat.saveSettings({ ...settings, name: 'Jarvis' });
    chats.retitleConversations();
    expect(chats.conversationChat(profileId).title).toBe('Jarvis');
    expect(opened.store.aiChats.titleAuto(chats.conversationChat(profileId).id)).toBe(false);
  });

  it('never reuses an ordinary chat or an archived conversation chat', () => {
    const ordinary = chats.forTurn(profileId, undefined, 'Shopping list');
    const archived = chats.conversationChat(profileId);
    opened.store.aiChats.update(archived.id, { archived: true });
    const next = chats.conversationChat(profileId);
    expect([ordinary.id, archived.id]).not.toContain(next.id);
    expect(next.title).toBe('Coordinator');
  });

  it('a voice call from the app without a chat joins the conversation chat', () => {
    const conversation = chats.conversationChat(profileId);
    minutesLater(60 * 24);
    const call = chats.chatForCall({ profileId, clientId: null, device: 'Pixel' }, null);
    expect(call.id).toBe(conversation.id);
  });

  it('keeps one chat per plugin source however long it was quiet', () => {
    const first = chats.chatForPlugin(profileId, 'plugin:discord:1', '#general');
    minutesLater(60 * 24 * 30);
    expect(chats.chatForPlugin(profileId, 'plugin:discord:1', '#general').id).toBe(first.id);
    expect(chats.chatForPlugin(profileId, 'plugin:discord:2', '#other').id).not.toBe(first.id);
  });
});
