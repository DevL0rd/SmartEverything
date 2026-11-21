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
  await opened.store.live.aiModels.load();
  const { store } = opened;
  profileId = store.profiles.first().id;
  chats = new ChatDirectory(
    store,
    new AssistantFiles({
      layout: hubLayout(opened.directory, {}),
      store: store,
      attachments: store.live.attachments,
      now,
    }),
  );
});

afterEach(async () => {
  await opened.close();
});

describe('conversation chats', () => {
  it('keeps using the same conversation chat however long it was quiet', async () => {
    const first = await chats.conversationChat(profileId);
    minutesLater(60 * 24 * 30);
    expect((await chats.conversationChat(profileId)).id).toBe(first.id);
  });

  it('names the conversation chat after the AI and keeps the name when it is used', async () => {
    expect(await chats.conversationChat(profileId)).toMatchObject({ title: 'Coordinator' });
    await opened.store.live.home.load();
    const settings = opened.store.live.home.assistant.read();
    await opened.store.live.home.assistant.save({ ...settings, name: 'Jarvis' });
    await chats.retitleConversations();
    expect((await chats.conversationChat(profileId)).title).toBe('Jarvis');
    expect(opened.store.aiChats.titleAuto((await chats.conversationChat(profileId)).id)).toBe(
      false,
    );
  });

  it('never reuses an ordinary chat or an archived conversation chat', async () => {
    const ordinary = await chats.forTurn(profileId, undefined, 'Shopping list');
    const archived = await chats.conversationChat(profileId);
    opened.store.aiChats.update(archived.id, { archived: true });
    const next = await chats.conversationChat(profileId);
    expect([ordinary.id, archived.id]).not.toContain(next.id);
    expect(next.title).toBe('Coordinator');
  });

  it('a voice call from the app without a chat joins the conversation chat', async () => {
    const conversation = await chats.conversationChat(profileId);
    minutesLater(60 * 24);
    const call = await chats.chatForCall({ profileId, clientId: null, device: 'Pixel' }, null);
    expect(call.id).toBe(conversation.id);
  });

  it('keeps one chat per plugin source however long it was quiet', async () => {
    const first = await chats.chatForPlugin(profileId, 'plugin:discord:1', '#general');
    minutesLater(60 * 24 * 30);
    expect((await chats.chatForPlugin(profileId, 'plugin:discord:1', '#general')).id).toBe(
      first.id,
    );
    expect((await chats.chatForPlugin(profileId, 'plugin:discord:2', '#other')).id).not.toBe(
      first.id,
    );
  });
});
