import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let chatId: string;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const { store } = opened;
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  const chat = store.aiChats.create({
    profileId: store.profiles.activeOf(client.id).id,
    kind: 'chat',
    title: 'Planning',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: { kind: 'openrouter', model: 'vendor/small', effort: null },
  });
  chatId = chat.id;
  store.aiChats.noteContext(chatId, 54);
});

afterEach(async () => {
  await opened.close();
});

describe('how full a chat is shown after the chat changes', () => {
  it('keeps the figure when only the title or the thinking effort changes', () => {
    const { aiChats } = opened.store;
    aiChats.update(chatId, { title: 'Renamed' });
    aiChats.update(chatId, {
      engine: { kind: 'openrouter', model: 'vendor/small', effort: 'high' },
    });
    expect(aiChats.chat(chatId).context_percent).toBe(54);
  });

  it('forgets the figure when another model takes over, since it measured the old model’s window', () => {
    const { aiChats } = opened.store;
    aiChats.update(chatId, { engine: { kind: 'openrouter', model: 'vendor/large', effort: null } });
    expect(aiChats.chat(chatId).context_percent).toBeNull();
  });
});
