import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { AssistantFiles } from '../../src/assistant/files';
import { testStore, type TestStore } from '../support/store';

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
    new AssistantFiles({ dataDirectory: opened.directory, chat: store.assistantChat, now }),
    now,
  );
});

afterEach(async () => {
  await opened.close();
});

describe('conversation chats', () => {
  it('reuses the latest conversation chat while it was active within the timeout', () => {
    const first = chats.conversationChat(profileId, 'Talking via Camera');
    minutesLater(90);
    opened.store.aiChats.touched(first.id, 0);
    minutesLater(200);
    expect(chats.conversationChat(profileId, 'Call from Coordinator').id).toBe(first.id);
  });

  it('starts a new chat once the latest one has been quiet longer than the timeout', () => {
    const first = chats.conversationChat(profileId, 'Talking via Camera');
    minutesLater(121);
    expect(chats.conversationChat(profileId, 'Talking via Camera').id).not.toBe(first.id);
  });

  it('starts a new chat every time when reuse is off', () => {
    const settings = opened.store.assistantChat.settings();
    opened.store.assistantChat.saveSettings({ ...settings, reuse_chat_minutes: 0 });
    const first = chats.conversationChat(profileId, 'Talking via Camera');
    expect(chats.conversationChat(profileId, 'Talking via Camera').id).not.toBe(first.id);
  });

  it('never reuses an ordinary chat or an archived conversation chat', () => {
    const ordinary = chats.forTurn(profileId, undefined, 'Shopping list');
    const archived = chats.conversationChat(profileId, 'Talking via Camera');
    opened.store.aiChats.update(archived.id, { archived: true });
    const next = chats.conversationChat(profileId, 'Talking via Camera');
    expect([ordinary.id, archived.id]).not.toContain(next.id);
  });

  it('a voice call from the app without a chat joins the conversation chat', () => {
    const conversation = chats.conversationChat(profileId, 'Talking via Camera');
    const call = chats.chatForCall({ profileId, clientId: null, device: 'Pixel' }, null);
    expect(call.id).toBe(conversation.id);
  });
});
